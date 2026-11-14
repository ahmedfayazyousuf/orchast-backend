import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthCookies } from './auth-cookies.js';
import { AuthService } from './auth.service.js';
import './auth-types.js';
import { SupabaseAuth } from '../supabase/supabase-auth.provider.js';
import { SupabaseService } from '../supabase/supabase.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthCookies, SupabaseService, SupabaseAuth],
})
export class AuthModule {}
