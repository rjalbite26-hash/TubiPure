<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class RenderAdminSeeder extends Seeder
{
    public function run(): void
    {
        $email = config('services.tubipure_admin.email');
        $password = config('services.tubipure_admin.password');
        $name = config('services.tubipure_admin.name', 'TubiPure Admin');

        if (! is_string($email) || trim($email) === '' || ! is_string($password) || $password === '') {
            return;
        }

        $admin = User::query()->firstOrNew(['email' => trim($email)]);
        $isNewAdmin = ! $admin->exists;

        $admin->name = is_string($name) && trim($name) !== '' ? trim($name) : 'TubiPure Admin';
        $admin->role = 'staff';

        if ($isNewAdmin) {
            $admin->password = $password;
        }

        $admin->save();
    }
}
