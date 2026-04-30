import React, { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface CommunityAuthBarProps {
  user: User | null;
  onAuthChange: (user: User | null) => void;
}

const CommunityAuthBar: React.FC<CommunityAuthBarProps> = ({ user, onAuthChange }) => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  // sign-in uses a single "username or email" field
  const [loginInput, setLoginInput] = useState('');
  // sign-up uses separate fields
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      onAuthChange(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, [onAuthChange]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setSignupSuccess(false);

    try {
      if (mode === 'signin') {
        const input = loginInput.trim();
        if (!input.includes('@')) {
          // Username sign-in: resolved server-side so the email is never exposed to the client
          const { data: fnData, error: fnErr } = await supabase.functions.invoke('sign-in-with-username', {
            body: { username: input, password },
          });
          if (fnErr) throw fnErr;
          if (fnData?.error) throw new Error(fnData.error);
          const { error: sessionErr } = await supabase.auth.setSession({
            access_token: fnData.session.access_token,
            refresh_token: fnData.session.refresh_token,
          });
          if (sessionErr) throw sessionErr;
        } else {
          const { error } = await supabase.auth.signInWithPassword({ email: input, password });
          if (error) {
            if (error.message.toLowerCase().includes('invalid login')) {
              throw new Error('Incorrect username, email, or password.');
            }
            throw error;
          }
        }
      } else {
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
          throw new Error('Username must be 3–20 characters: letters, numbers, and underscores only.');
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username } },
        });
        if (error) {
          if (error.message.toLowerCase().includes('rate limit')) {
            throw new Error('Too many signup attempts. Please wait a few minutes and try again.');
          }
          if (error.status === 400 || error.message.toLowerCase().includes('already registered')) {
            throw new Error('An account with that email already exists. Try signing in instead.');
          }
          throw error;
        }
        setSignupSuccess(true);
      }
      setLoginInput('');
      setUsername('');
      setEmail('');
      setPassword('');
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (user) {
    const displayName = user.user_metadata?.username ?? user.email;
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="text-neutral-400">{displayName}</span>
        <button
          onClick={handleSignOut}
          className="rounded bg-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-600"
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <form onSubmit={handleSubmit} className="flex items-center gap-2 flex-wrap">
        {mode === 'signin' ? (
          <input
            type="text"
            placeholder="Username or email"
            value={loginInput}
            onChange={(e) => setLoginInput(e.target.value)}
            required
            className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 placeholder-neutral-500 focus:border-indigo-500 focus:outline-none w-44"
          />
        ) : (
          <>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 placeholder-neutral-500 focus:border-indigo-500 focus:outline-none w-32"
            />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 placeholder-neutral-500 focus:border-indigo-500 focus:outline-none w-44"
            />
          </>
        )}
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 placeholder-neutral-500 focus:border-indigo-500 focus:outline-none w-36"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {loading ? '...' : mode === 'signin' ? 'Sign In' : 'Sign Up'}
        </button>
        <button
          type="button"
          onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setSignupSuccess(false); }}
          className="text-xs text-neutral-400 hover:text-neutral-200 underline"
        >
          {mode === 'signin' ? 'Create account' : 'Already have an account?'}
        </button>
      </form>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {signupSuccess && <p className="text-xs text-green-400">Check your email to confirm your account.</p>}
    </div>
  );
};

export default CommunityAuthBar;
