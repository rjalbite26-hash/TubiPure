<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ChangePasswordRequest;
use App\Http\Requests\ForgotPasswordRequest;
use App\Http\Requests\LoginRequest;
use App\Http\Requests\RegisterRequest;
use App\Http\Requests\ResetPasswordRequest;
use App\Http\Requests\UpdateProfilePhotoRequest;
use App\Http\Requests\UpdateProfileRequest;
use App\Models\User;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Contracts\Auth\CanResetPassword;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(RegisterRequest $request): JsonResponse
    {
        $data = $request->validated();
        $user = DB::transaction(function () use ($data): User {
            $user = User::create([
                'name' => $data['name'],
                'email' => $data['email'],
                'password' => Hash::make($data['password']),
                'role' => 'customer',
            ]);

            $user->customer()->create([
                'name' => $data['name'],
                'email' => $data['email'],
                'address' => $data['address'] ?? '',
                'contact' => $data['contact'],
            ]);

            return $user->load(['customer.addresses']);
        });

        Auth::login($user);
        $request->session()->regenerate();

        return response()->json(['user' => $this->userData($user)], 201);
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $credentials = $request->validated();
        $throttleKey = 'login:'.Str::transliterate(Str::lower($credentials['email']).'|'.$request->ip());

        if (RateLimiter::tooManyAttempts($throttleKey, 5)) {
            $retryAfter = RateLimiter::availableIn($throttleKey);

            return response()->json([
                'message' => "Too many login attempts. Please try again in {$retryAfter} seconds.",
            ], 429)->header('Retry-After', (string) $retryAfter);
        }

        if (! Auth::attempt($credentials)) {
            RateLimiter::hit($throttleKey, 60);

            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        RateLimiter::clear($throttleKey);
        $request->session()->regenerate();
        $user = $request->user()->load(['customer.addresses']);

        return response()->json(['user' => $this->userData($user)]);
    }

    public function current(Request $request): JsonResponse
    {
        $user = $request->user()->load([
            'customer.addresses',
            'customer.deliveries' => fn ($query) => $query->latest('date'),
        ]);

        return response()->json(['user' => $this->userData($user)]);
    }

    public function updateProfile(UpdateProfileRequest $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validated();

        DB::transaction(function () use ($user, $data): void {
            $user->update([
                'name' => $data['name'],
                'email' => $data['email'],
            ]);

            if ($user->customer) {
                $user->customer->update([
                    'name' => $data['name'],
                    'email' => $data['email'],
                    'contact' => $data['contact'],
                ]);
            }
        });

        return response()->json(['message' => 'Profile updated.']);
    }

    public function changePassword(ChangePasswordRequest $request): JsonResponse
    {
        $request->user()->forceFill([
            'password' => Hash::make($request->validated('password')),
        ])->save();

        return response()->json(['message' => 'Your password has been changed.']);
    }

    public function updateProfilePhoto(UpdateProfilePhotoRequest $request): JsonResponse
    {
        $user = $request->user();
        $previousPhotoPath = $user->profile_photo_path;
        $photoPath = $request->file('photo')->storePublicly('profile-photos', 'public');

        $user->update(['profile_photo_path' => $photoPath]);

        if ($previousPhotoPath) {
            Storage::disk('public')->delete($previousPhotoPath);
        }

        return response()->json([
            'message' => 'Profile picture updated.',
            'user' => $this->userData($user->refresh()),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['message' => 'Signed out.', 'csrfToken' => csrf_token()]);
    }

    public function sendPasswordResetLink(ForgotPasswordRequest $request): JsonResponse
    {
        $localResetUrl = null;
        $allowLocalResetUrl = app()->environment('local')
            && config('mail.default') === 'log'
            && in_array($request->ip(), ['127.0.0.1', '::1'], true);

        if ($allowLocalResetUrl) {
            Password::sendResetLink($request->validated(), function (CanResetPassword $user, string $token) use (&$localResetUrl): string {
                $localResetUrl = route('password.reset', [
                    'token' => $token,
                    'email' => $user->getEmailForPasswordReset(),
                ]);

                return Password::RESET_LINK_SENT;
            });
        } else {
            Password::sendResetLink($request->validated());
        }

        $response = [
            'message' => $allowLocalResetUrl && $localResetUrl !== null
                ? 'A local reset link is ready. Open it below to choose a new password.'
                : 'If an account matches that email address, a password reset link will be sent shortly.',
        ];

        if ($allowLocalResetUrl && $localResetUrl !== null) {
            $response['local_reset_url'] = $localResetUrl;
        }

        return response()->json($response);
    }

    public function resetPassword(ResetPasswordRequest $request): JsonResponse
    {
        $status = Password::reset($request->validated(), function (User $user, string $password): void {
            $user->forceFill([
                'password' => Hash::make($password),
                'remember_token' => Str::random(60),
            ])->save();

            if (config('session.driver') === 'database') {
                DB::table(config('session.table', 'sessions'))
                    ->where('user_id', $user->getAuthIdentifier())
                    ->delete();
            }

            event(new PasswordReset($user));
        });

        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages(['email' => ['This password reset link is invalid or expired.']]);
        }

        return response()->json(['message' => 'Your password has been reset. You can sign in now.']);
    }

    /**
     * @return array<string, mixed>
     */
    private function userData(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'profile_photo_url' => $user->profile_photo_path ? Storage::disk('public')->url($user->profile_photo_path) : null,
            'role' => $user->role,
            'customer' => $user->customer ? [
                'id' => $user->customer->id,
                'name' => $user->customer->name,
                'email' => $user->customer->email,
                'address' => $user->customer->address,
                'contact' => $user->customer->contact,
                'addresses' => $user->customer->addresses->map(fn ($address): array => [
                    'id' => $address->id,
                    'label' => $address->label,
                    'address' => $address->address,
                    'latitude' => $address->latitude,
                    'longitude' => $address->longitude,
                    'is_default' => $address->is_default,
                ])->all(),
                'deliveries' => $user->customer->deliveries->map(fn ($delivery): array => [
                    'id' => $delivery->id,
                    'created_at' => $delivery->created_at?->toIso8601String(),
                    'customer_id' => $delivery->customer_id,
                    'date' => $delivery->date->format('Y-m-d'),
                    'time_slot' => $delivery->time_slot,
                    'gallons' => $delivery->gallons,
                    'status' => $delivery->status,
                    'status_note' => $delivery->status_note,
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
                ])->all(),
            ] : null,
        ];
    }
}
