import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GENERIC_AUTH_ERROR = 'Incorrect username or password.';

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: CORS_HEADERS });
    }

    try {
        const { username, password } = await req.json();
        if (!username || !password) {
            return Response.json(
                { error: 'Username and password are required.' },
                {
                    status: 400,
                    headers: CORS_HEADERS,
                }
            );
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

        // Use service role to resolve username → user ID (email never returned to caller)
        const adminClient = createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        const { data: profile } = await adminClient
            .from('profiles')
            .select('id')
            .ilike('username', username.trim())
            .maybeSingle();

        if (!profile) {
            return Response.json({ error: GENERIC_AUTH_ERROR }, { status: 401, headers: CORS_HEADERS });
        }

        const {
            data: { user },
        } = await adminClient.auth.admin.getUserById(profile.id);
        if (!user?.email) {
            return Response.json({ error: GENERIC_AUTH_ERROR }, { status: 401, headers: CORS_HEADERS });
        }

        // Perform the actual sign-in using the public API so a proper session is issued
        const userClient = createClient(supabaseUrl, anonKey, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        const { data: signInData, error: signInError } = await userClient.auth.signInWithPassword({
            email: user.email,
            password,
        });

        if (signInError) {
            return Response.json({ error: GENERIC_AUTH_ERROR }, { status: 401, headers: CORS_HEADERS });
        }

        return Response.json(signInData, { headers: CORS_HEADERS });
    } catch {
        return Response.json(
            { error: 'An unexpected error occurred.' },
            {
                status: 500,
                headers: CORS_HEADERS,
            }
        );
    }
});
