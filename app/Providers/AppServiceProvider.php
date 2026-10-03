<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('password-reset', function (Request $request): Limit {
            $email = Str::lower($request->string('email')->trim()->toString());

            return Limit::perMinute(3)->by(Str::transliterate($email.'|'.$request->ip()));
        });

        RateLimiter::for('orders', function (Request $request): Limit {
            return Limit::perHour(10)->by((string) $request->user()?->getAuthIdentifier());
        });

        PasswordRule::defaults(function (): PasswordRule {
            $rule = PasswordRule::min(10);

            return app()->isProduction() ? $rule->mixedCase()->numbers() : $rule;
        });
    }
}
