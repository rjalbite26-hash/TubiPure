<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ContactMessageController;
use App\Http\Controllers\Api\CustomerAddressController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DeliveryController;
use App\Http\Controllers\Api\PricingSettingsController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('tubipure');
});

Route::view('/login', 'auth.page', ['mode' => 'login'])->name('login');
Route::view('/signup', 'auth.page', ['mode' => 'signup'])->name('signup');
Route::view('/forgot-password', 'auth.page', ['mode' => 'forgot'])->name('password.request');

Route::get('/reset-password/{token}', function (Request $request, string $token) {
    return view('auth.page', [
        'mode' => 'reset',
        'token' => $token,
        'email' => $request->query('email', ''),
    ]);
})->name('password.reset');

Route::prefix('api')->name('api.')->group(function (): void {
    Route::get('/public/stats', [DashboardController::class, 'publicStats']);
    Route::get('/pricing', [PricingSettingsController::class, 'show']);
    Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:5,1');
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/password/forgot', [AuthController::class, 'sendPasswordResetLink'])->middleware('throttle:password-reset');
    Route::post('/password/reset', [AuthController::class, 'resetPassword'])->middleware('throttle:5,1');
    Route::post('/contact-messages', [ContactMessageController::class, 'store'])->middleware('throttle:5,1');

    Route::middleware('auth')->group(function (): void {
        Route::get('/me', [AuthController::class, 'current']);
        Route::put('/profile', [AuthController::class, 'updateProfile']);
        Route::put('/password', [AuthController::class, 'changePassword'])->middleware('throttle:5,1');
        Route::post('/profile/photo', [AuthController::class, 'updateProfilePhoto']);
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::get('/my/orders', [DeliveryController::class, 'myOrders']);
        Route::post('/my/orders', [DeliveryController::class, 'storeForCustomer'])->middleware('throttle:orders');
        Route::patch('/my/orders/{delivery}/cancel', [DeliveryController::class, 'cancelCustomerOrder']);
        Route::get('/my/addresses', [CustomerAddressController::class, 'index']);
        Route::post('/my/addresses', [CustomerAddressController::class, 'store']);
        Route::put('/my/addresses/{address}', [CustomerAddressController::class, 'update']);
        Route::patch('/my/addresses/{address}/default', [CustomerAddressController::class, 'setDefault']);
        Route::delete('/my/addresses/{address}', [CustomerAddressController::class, 'destroy']);

        Route::prefix('staff')->middleware('staff')->group(function (): void {
            Route::put('/pricing', [PricingSettingsController::class, 'update']);
            Route::get('/dashboard', [DashboardController::class, 'index']);
            Route::get('/contact-messages', [ContactMessageController::class, 'index']);
            Route::patch('/contact-messages/{message}/read', [ContactMessageController::class, 'markRead']);
            Route::get('/customers', [CustomerController::class, 'index']);
            Route::get('/users', [UserController::class, 'index']);
            Route::post('/customers', [CustomerController::class, 'store']);
            Route::put('/customers/{customer}', [CustomerController::class, 'update']);
            Route::patch('/customers/{customer}/archive', [CustomerController::class, 'archiveRecord']);
            Route::get('/deliveries', [DeliveryController::class, 'index']);
            Route::post('/deliveries', [DeliveryController::class, 'store']);
            Route::delete('/deliveries/{delivery}', [DeliveryController::class, 'destroy']);
            Route::put('/deliveries/{delivery}', [DeliveryController::class, 'update']);
            Route::patch('/deliveries/{delivery}/status', [DeliveryController::class, 'updateStatus']);
            Route::patch('/deliveries/{delivery}/cancel', [DeliveryController::class, 'cancel']);
        });
    });
});
