<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdatePricingSettingsRequest;
use App\Models\PricingSetting;
use Illuminate\Http\JsonResponse;

class PricingSettingsController extends Controller
{
    public function show(): JsonResponse
    {
        return response()->json(['data' => $this->currentSettings()]);
    }

    public function update(UpdatePricingSettingsRequest $request): JsonResponse
    {
        $settings = $this->currentSettings();
        $settings->update($request->validated());

        return response()->json(['data' => $settings->refresh()]);
    }

    private function currentSettings(): PricingSetting
    {
        return PricingSetting::current();
    }
}
