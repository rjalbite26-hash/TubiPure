<?php

namespace App\Http\Requests;

use App\Models\CustomerAddress;
use App\Models\PricingSetting;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class PlaceCustomerOrderRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()?->role === 'customer';
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'water_selection' => ['required', Rule::in(['alkaline', 'purified', 'both'])],
            'container_size_gallons' => ['required', 'integer', Rule::in(config('water.container_sizes_gallons'))],
            'quantity' => ['exclude_if:water_selection,both', 'required_if:water_selection,alkaline,purified', 'integer', 'min:1', 'max:50'],
            'alkaline_quantity' => ['exclude_unless:water_selection,both', 'required', 'integer', 'min:1', 'max:50'],
            'purified_quantity' => ['exclude_unless:water_selection,both', 'required', 'integer', 'min:1', 'max:50'],
            'fulfillment_method' => ['required', Rule::in(['delivery', 'pickup'])],
            'payment_method' => ['exclude_if:fulfillment_method,pickup', 'required', Rule::in(['cash_on_delivery'])],
            'date' => ['required', 'date', 'after_or_equal:today'],
            'time_slot' => ['required', 'date_format:H:i', 'regex:/^(?:[01]\d|2[0-3]):[0-5][05]$/'],
            'contact_name' => ['required', 'string', 'max:255'],
            'contact_phone' => ['required', 'string', 'regex:/^[0-9]{11}$/'],
            'delivery_address' => [
                'required_if:fulfillment_method,delivery',
                'nullable',
                'integer',
                Rule::exists('customer_addresses', 'id')->where('customer_id', $this->user()->customer?->id),
            ],
            'delivery_instructions' => ['nullable', 'string', 'max:1000'],
        ];
    }

    /**
     * Get the validation messages for the request.
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'time_slot.regex' => 'Choose a time in 5-minute steps during delivery availability.',
            'contact_phone.regex' => 'Enter a contact number with exactly 11 digits.',
        ];
    }

    /**
     * Validate order time against the current delivery schedule.
     *
     * @return array<int, callable(Validator): void>
     */
    public function after(): array
    {
        return [function (Validator $validator): void {
            $customer = $this->user()->customer;

            if ($this->input('fulfillment_method') === 'delivery') {
                if (! $validator->errors()->has('delivery_address')) {
                    $address = CustomerAddress::query()
                        ->where('customer_id', $customer?->id)
                        ->find($this->input('delivery_address'));

                    if ($address && $address->latitude !== null && $address->longitude !== null
                        && ! $this->isWithinVisayanVillage((float) $address->latitude, (float) $address->longitude)) {
                        $validator->errors()->add(
                            'delivery_address',
                            'Delivery is available only within Visayan Village, Tagum City. Choose pickup or select an address within the delivery area.',
                        );
                    }
                }
            }

            if ($validator->errors()->hasAny(['date', 'time_slot', 'fulfillment_method'])) {
                return;
            }

            $pricingSettings = PricingSetting::current();
            $timeSlot = $this->input('time_slot');
            $isPickup = $this->input('fulfillment_method') === 'pickup';
            $day = (new \DateTimeImmutable($this->input('date')))->format('l');
            $schedule = $isPickup ? $pricingSettings->station_schedule : $pricingSettings->delivery_schedule;
            $hours = $schedule[$day] ?? null;

            if ($schedule !== null && (! is_array($hours) || ! ($hours['open'] ?? false))) {
                $validator->errors()->add(
                    'date',
                    $isPickup
                        ? "The station is closed on {$day}. Choose another date."
                        : "Delivery is not available on {$day}. Choose another date or select pickup.",
                );

                return;
            }

            $startTime = substr($hours['opens'] ?? ($isPickup ? $pricingSettings->opening_time : $pricingSettings->delivery_start_time), 0, 5);
            $endTime = substr($hours['closes'] ?? ($isPickup ? $pricingSettings->closing_time : $pricingSettings->delivery_end_time), 0, 5);

            if ($timeSlot < $startTime || $timeSlot > $endTime) {
                $validator->errors()->add('time_slot', "Choose a time between {$startTime} and {$endTime} on {$day}.");
            }

            $currentTime = now();

            if ($this->input('date') === $currentTime->toDateString() && $timeSlot <= $currentTime->format('H:i')) {
                $validator->errors()->add('time_slot', 'Choose a time slot that has not passed.');
            }
        }];
    }

    private function isWithinVisayanVillage(float $latitude, float $longitude): bool
    {
        $polygon = config('water.village_polygon', []);
        $inside = false;
        $pointCount = count($polygon);

        for ($current = 0, $previous = $pointCount - 1; $current < $pointCount; $previous = $current++) {
            [$currentLongitude, $currentLatitude] = $polygon[$current];
            [$previousLongitude, $previousLatitude] = $polygon[$previous];

            $crossProduct = ($longitude - $currentLongitude) * ($previousLatitude - $currentLatitude)
                - ($latitude - $currentLatitude) * ($previousLongitude - $currentLongitude);
            $onSegment = abs($crossProduct) < 1.0e-10
                && $longitude >= min($currentLongitude, $previousLongitude) - 1.0e-10
                && $longitude <= max($currentLongitude, $previousLongitude) + 1.0e-10
                && $latitude >= min($currentLatitude, $previousLatitude) - 1.0e-10
                && $latitude <= max($currentLatitude, $previousLatitude) + 1.0e-10;

            if ($onSegment) {
                return true;
            }

            $crossesLatitude = ($currentLatitude > $latitude) !== ($previousLatitude > $latitude);

            if ($crossesLatitude && $longitude < ($previousLongitude - $currentLongitude)
                * ($latitude - $currentLatitude) / ($previousLatitude - $currentLatitude) + $currentLongitude) {
                $inside = ! $inside;
            }
        }

        return $inside;
    }
}
