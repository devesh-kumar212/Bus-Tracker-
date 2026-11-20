1. In the existing Supabase project, apply the updated Auth signup trigger from `backend/supabase_schema.sql` (the `handle_trackmybus_auth_signup` function and its two `auth.users` triggers). It waits for `email_confirmed_at` before upserting driver records and does not delete application rows or create tables.
2. In **Authentication → Sign In / Providers → Email**, keep **Confirm email** enabled. Driver registration uses `signInWithOtp({ shouldCreateUser: true })` and verifies the six-digit code using `verifyOtp({ type: 'email' })`. Set both **Magic Link** and **Confirm signup** email template bodies to:

   ```html
   <h2>TrackMyBus email verification</h2>
   <p>Enter this 6-digit code in the driver registration form:</p>
   <p style="font-size: 24px; font-weight: bold; letter-spacing: 6px;">{{ .Token }}</p>
   <p>If you did not request this code, ignore this email.</p>
   ```

   Do not use `{{ .ConfirmationURL }}` in either template. Set the Email OTP expiration to 600 seconds (10 minutes). The page allows resend after 60 seconds.
3. Configure Custom SMTP in **Supabase → Authentication → SMTP Settings**. For Gmail, use `smtp.gmail.com`, port `465`, a Google App Password, and set Sender email to the same Gmail address as the SMTP username. Supabase Auth logs show provider rejection details. SMTP settings in `backend/.env` are only for admin approval/rejection notifications.
4. In **Authentication → URL Configuration**, allow `http://localhost:5174/reset-password` and the deployed app's corresponding URLs. Driver registration uses a numeric OTP, so no email confirmation link redirect is needed.
5. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the frontend environment. Set `SUPABASE_URL` and the same public anon/publishable key in the backend environment. Never put a service-role key in the frontend or use it for these APIs.
6. Driver applications collect a mobile number and license number, but verification currently uses the project's existing email flow. To use phone OTP, enable Supabase Phone Auth and configure an SMS provider first; the UI must be switched to phone OTP only after that provider is ready.

For testing from a phone on the same Wi-Fi, start Vite with `npm run dev -- --host 0.0.0.0 --port 5174` and open `http://<your-PC-LAN-IP>:5174` on the phone; `localhost` on a phone refers to the phone itself. Allow ports 5174 (Vite) and 5000 (API) through Windows Firewall on the private network if prompted. Run the backend with `cd backend && npm start`. Backend tests run with `npm test`; the frontend production build runs with `npm run build`.
