<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\PlaceCustomerOrderRequest;
use App\Http\Requests\RejectDeliveryRequest;
use App\Http\Requests\SaveDeliveryRequest;
use App\Http\Requests\UpdateDeliveryStatusRequest;
use App\Models\Delivery;
use App\Models\PricingSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class DeliveryController extends Controller
{
    private const MINIMUM_DELIVERY_FEE = 5.00;

    public function index(Request $request): JsonResponse
    {
        $deliveries = Delivery::query()
            ->with('customer:id,name,address,contact')
            ->when($request->query('status') && $request->query('status') !== 'all', fn ($query) => $query->where('status', $request->query('status')))
            ->orderBy('date')
            ->get()
            ->map(fn (Delivery $delivery): array => $this->deliveryData($delivery));

        return response()->json(['data' => $deliveries]);
    }

    public function store(SaveDeliveryRequest $request): JsonResponse
    {
        $data = $request->validated();
        if ($request->boolean('is_walk_in')) {
            $selectedWaterType = $data['water_type'];
            $alkalineQuantity = $selectedWaterType === 'both'
                ? (int) $data['alkaline_quantity']
                : ($selectedWaterType === 'alkaline' ? (int) $data['quantity'] : 0);
            $purifiedQuantity = $selectedWaterType === 'both'
                ? (int) $data['purified_quantity']
                : ($selectedWaterType === 'purified' ? (int) $data['quantity'] : 0);
            $quantity = $alkalineQuantity + $purifiedQuantity;
            $pricingSettings = PricingSetting::current();
            $alkalinePrice = (float) $pricingSettings->alkaline_price_per_gallon;
            $purifiedPrice = (float) $pricingSettings->purified_price_per_gallon;
            $gallons = $alkalineQuantity + $purifiedQuantity;
            $waterSubtotal = round($alkalineQuantity * $alkalinePrice + $purifiedQuantity * $purifiedPrice, 2);
            $ratePerGallon = $gallons > 0 ? $waterSubtotal / $gallons : 0;
            $waterType = match ($selectedWaterType) {
                'both' => 'alkaline,purified',
                default => $selectedWaterType,
            };

            unset($data['is_walk_in']);
            $data = [
                ...$data,
                'customer_id' => null,
                'status' => 'Delivered',
                'water_type' => $waterType,
                'container_size_gallons' => 1,
                'gallons' => $gallons,
                'quantity' => $quantity,
                'alkaline_quantity' => $alkalineQuantity ?: null,
                'purified_quantity' => $purifiedQuantity ?: null,
                'fulfillment_method' => 'pickup',
                'rate_per_gallon' => $ratePerGallon,
                'alkaline_rate_per_gallon' => $pricingSettings->alkaline_price_per_gallon,
                'purified_rate_per_gallon' => $pricingSettings->purified_price_per_gallon,
                'delivery_rate_per_km' => null,
                'delivery_distance_km' => null,
                'water_subtotal' => $waterSubtotal,
                'delivery_fee' => 0,
                'order_total' => $waterSubtotal,
                'contact_name' => 'Walk-in customer',
                'contact_phone' => null,
            ];
        }

        $delivery = Delivery::create($data);
        $this->restoreCustomerRecordForTerminalOrder($delivery);

        return response()->json(['data' => $this->deliveryData($delivery->load('customer'))], 201);
    }

    public function update(SaveDeliveryRequest $request, Delivery $delivery): JsonResponse
    {
        abort_if(in_array($delivery->status, ['Delivered', 'Cancelled'], true), 409, 'Completed or cancelled deliveries cannot be edited.');

        $delivery->update($request->validated());
        $this->restoreCustomerRecordForTerminalOrder($delivery);

        return response()->json(['data' => $this->deliveryData($delivery->load('customer'))]);
    }

    public function destroy(Delivery $delivery): JsonResponse
    {
        abort_unless(in_array($delivery->status, ['Delivered', 'Cancelled'], true), 409, 'Only completed or cancelled orders can be deleted from order history.');

        $delivery->delete();

        return response()->json(['message' => 'Order deleted from history.']);
    }

    public function updateStatus(UpdateDeliveryStatusRequest $request, Delivery $delivery): JsonResponse
    {
        abort_if(in_array($delivery->status, ['Delivered', 'Cancelled'], true), 409, 'Completed or cancelled deliveries cannot be updated.');

        $delivery->update($request->validated());
        $this->restoreCustomerRecordForTerminalOrder($delivery);

        return response()->json(['data' => $this->deliveryData($delivery->load('customer'))]);
    }

    public function cancel(RejectDeliveryRequest $request, Delivery $delivery): JsonResponse
    {
        abort_if(in_array($delivery->status, ['Delivered', 'Cancelled'], true), 409, 'Completed or already cancelled deliveries cannot be cancelled.');
        $delivery->update([
            'status' => 'Cancelled',
            'status_note' => $request->validated('reason'),
        ]);
        $this->restoreCustomerRecordForTerminalOrder($delivery);

        return response()->json(['data' => $this->deliveryData($delivery->load('customer'))]);
    }

    public function storeForCustomer(PlaceCustomerOrderRequest $request): JsonResponse
    {
        $customer = $request->user()->customer;
        abort_unless($customer, 403, 'A customer profile is required to place an order.');

        $data = $request->validated();
        $pricingSettings = PricingSetting::current();
        $deliveryZone = null;
        $deliveryAddressText = null;
        $customerAddressId = null;
        $deliveryLatitude = null;
        $deliveryLongitude = null;
        $deliveryDistanceInKilometers = null;
        if ($data['fulfillment_method'] === 'delivery') {
            $savedAddress = $customer->addresses()->findOrFail($data['delivery_address']);
            if ($savedAddress->latitude === null || $savedAddress->longitude === null) {
                throw ValidationException::withMessages([
                    'delivery_address' => 'Edit this saved address in My Address and set its location on the map before ordering delivery.',
                ]);
            }

            $deliveryDistanceInKilometers = round($this->distanceInKilometers(
                $savedAddress->latitude,
                $savedAddress->longitude,
                (float) config('water.company_location.latitude'),
                (float) config('water.company_location.longitude'),
            ), 2);
            $deliveryZone = $this->zoneForDistance($deliveryDistanceInKilometers);
            $deliveryAddressText = $savedAddress->address;
            $customerAddressId = $savedAddress->id;
            $deliveryLatitude = $savedAddress->latitude;
            $deliveryLongitude = $savedAddress->longitude;
        }
        $waterTypes = $data['water_selection'] === 'both' ? ['alkaline', 'purified'] : [$data['water_selection']];
        $alkalineQuantity = $data['water_selection'] === 'both'
            ? (int) $data['alkaline_quantity']
            : ($data['water_selection'] === 'alkaline' ? (int) $data['quantity'] : 0);
        $purifiedQuantity = $data['water_selection'] === 'both'
            ? (int) $data['purified_quantity']
            : ($data['water_selection'] === 'purified' ? (int) $data['quantity'] : 0);
        $totalQuantity = $alkalineQuantity + $purifiedQuantity;
        $data['quantity'] = $totalQuantity;
        unset($data['water_selection']);
        $gallons = (int) $data['container_size_gallons'] * $totalQuantity;
        $alkalineGallons = (int) $data['container_size_gallons'] * $alkalineQuantity;
        $purifiedGallons = (int) $data['container_size_gallons'] * $purifiedQuantity;
        $waterSubtotal = round(
            $alkalineGallons * (float) $pricingSettings->alkaline_price_per_gallon
                + $purifiedGallons * (float) $pricingSettings->purified_price_per_gallon,
            2,
        );
        $deliveryRatePerKilometer = $deliveryZone !== null ? (float) $pricingSettings->delivery_price_per_km : null;
        $deliveryFee = $deliveryDistanceInKilometers !== null
            ? $this->deliveryFeeForDistance($deliveryDistanceInKilometers, $deliveryRatePerKilometer)
            : 0;
        $orderTotal = round($waterSubtotal + $deliveryFee, 2);
        $data = [
            ...$data,
            'payment_method' => $data['payment_method'] ?? null,
            'customer_id' => $customer->id,
            'water_type' => implode(',', $waterTypes),
            'alkaline_quantity' => $alkalineQuantity ?: null,
            'purified_quantity' => $purifiedQuantity ?: null,
            'gallons' => $gallons,
            'status' => 'Pending',
            'rate_per_gallon' => null,
            'alkaline_rate_per_gallon' => $pricingSettings->alkaline_price_per_gallon,
            'purified_rate_per_gallon' => $pricingSettings->purified_price_per_gallon,
            'delivery_rate_per_km' => $deliveryRatePerKilometer,
            'delivery_distance_km' => $deliveryDistanceInKilometers,
            'water_subtotal' => $waterSubtotal,
            'delivery_fee' => $deliveryFee,
            'order_total' => $orderTotal,
            'delivery_zone' => $deliveryZone,
            'customer_address_id' => $customerAddressId,
            'delivery_address' => $deliveryAddressText,
            'delivery_latitude' => $deliveryLatitude,
            'delivery_longitude' => $deliveryLongitude,
        ];
        $delivery = Delivery::create($data);

        return response()->json(['data' => $this->deliveryData($delivery->load('customer'))], 201);
    }

    public function myOrders(Request $request): JsonResponse
    {
        $customer = $request->user()->customer;
        abort_unless($customer, 403, 'A customer profile is required to view orders.');

        $deliveries = $customer->deliveries()->with('customer:id,name,address,contact')->orderByDesc('date')->get()
            ->map(fn (Delivery $delivery): array => $this->deliveryData($delivery));

        return response()->json(['data' => $deliveries]);
    }

    public function cancelCustomerOrder(Request $request, Delivery $delivery): JsonResponse
    {
        $customer = $request->user()->customer;
        abort_unless($request->user()->role === 'customer' && $customer && $delivery->customer_id === $customer->id, 404);

        $updated = Delivery::query()
            ->whereKey($delivery->id)
            ->where('customer_id', $customer->id)
            ->where('status', 'Pending')
            ->update(['status' => 'Cancelled', 'updated_at' => now()]);

        abort_if($updated === 0, 409, 'Only pending orders can be cancelled.');

        return response()->json(['data' => $this->deliveryData($delivery->fresh()->load('customer'))]);
    }

    /**
     * @return array<string, mixed>
     */
    private function deliveryData(Delivery $delivery): array
    {
        return [
            'id' => $delivery->id,
            'created_at' => $delivery->created_at?->toIso8601String(),
            'updated_at' => $delivery->updated_at?->toIso8601String(),
            'customer_id' => $delivery->customer_id,
            'customer_address_id' => $delivery->customer_address_id,
            'date' => $delivery->date->format('Y-m-d'),
            'time_slot' => $delivery->time_slot,
            'gallons' => $delivery->gallons,
            'status' => $delivery->status,
            'status_note' => $delivery->status_note,
            'address' => $delivery->delivery_address ?? $delivery->customer?->address,
            'water_type' => $delivery->water_type,
            'water_types' => $delivery->water_type ? explode(',', $delivery->water_type) : [],
            'container_size_gallons' => $delivery->container_size_gallons,
            'quantity' => $delivery->quantity,
            'alkaline_quantity' => $delivery->alkaline_quantity,
            'purified_quantity' => $delivery->purified_quantity,
            'fulfillment_method' => $delivery->fulfillment_method,
            'payment_method' => $delivery->payment_method,
            'delivery_zone' => $delivery->delivery_zone,
            'rate_per_gallon' => $delivery->rate_per_gallon,
            'alkaline_rate_per_gallon' => $delivery->alkaline_rate_per_gallon,
            'purified_rate_per_gallon' => $delivery->purified_rate_per_gallon,
            'delivery_rate_per_km' => $delivery->delivery_rate_per_km,
            'delivery_distance_km' => $delivery->delivery_distance_km,
            'water_subtotal' => $delivery->water_subtotal,
            'delivery_fee' => $delivery->delivery_fee,
            'order_total' => $delivery->order_total,
            'contact_name' => $delivery->contact_name,
            'contact_phone' => $delivery->contact_phone,
            'delivery_address' => $delivery->delivery_address,
            'delivery_latitude' => $delivery->delivery_latitude,
            'delivery_longitude' => $delivery->delivery_longitude,
            'delivery_instructions' => $delivery->delivery_instructions,
            'customer' => $delivery->customer ? [
                'id' => $delivery->customer->id,
                'name' => $delivery->customer->name,
                'address' => $delivery->customer->address,
                'contact' => $delivery->customer->contact,
            ] : null,
        ];
    }

    private function restoreCustomerRecordForTerminalOrder(Delivery $delivery): void
    {
        if (in_array($delivery->status, ['Delivered', 'Cancelled'], true)) {
            $delivery->customer()->where('is_archived', true)->update(['is_archived' => false]);
        }
    }

    private function distanceInKilometers(float $latitude, float $longitude, float $targetLatitude, float $targetLongitude): float
    {
        $earthRadiusKilometers = 6371;
        $latitudeDifference = deg2rad($targetLatitude - $latitude);
        $longitudeDifference = deg2rad($targetLongitude - $longitude);
        $haversine = sin($latitudeDifference / 2) ** 2
            + cos(deg2rad($latitude)) * cos(deg2rad($targetLatitude)) * sin($longitudeDifference / 2) ** 2;

        return $earthRadiusKilometers * 2 * asin(min(1, sqrt($haversine)));
    }

    private function deliveryFeeForDistance(float $distanceInKilometers, float $ratePerKilometer): float
    {
        if ($distanceInKilometers <= 1) {
            return self::MINIMUM_DELIVERY_FEE;
        }

        return max(self::MINIMUM_DELIVERY_FEE, round($distanceInKilometers * $ratePerKilometer, 2));
    }

    private function zoneForDistance(float $distanceInKilometers): string
    {
        foreach (config('water.zone_max_km') as $zoneId => $maximumDistance) {
            if ($maximumDistance === null || $distanceInKilometers <= $maximumDistance) {
                return $zoneId;
            }
        }

        return (string) array_key_last(config('water.zone_max_km'));
    }
}
