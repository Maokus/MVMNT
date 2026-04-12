import React, { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface CommunityAuthBarProps {
  user: User | null;
  onAuthChange: (user: User | null) => void;
}

const CommunityAuthBar: React.FC<CommunityAuthBarProps> = ({ user, onAuthChange }) => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

    // Supabase Auth uses email internally; we derive a synthetic email from the username.
    // Email confirmation must be disabled in the Supabase Auth settings for this to work.
    const syntheticEmail = `${username.toLowerCase()}@mvmnt.local`;

    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: syntheticEmail, password });
        if (error) {
          if (error.message.toLowerCase().includes('invalid login')) {
            throw new Error('Incorrect username or password.');
          }
          throw error;
        }
      } else {
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
          throw new Error('Username must be 3–20 characters and contain only letters, numbers, or underscores.');
        }
        const { error } = await supabase.auth.signUp({
          email: syntheticEmail,
          password,
          options: { data: { username } },
        });
        if (error) {
          if (error.message.toLowerCase().includes('rate limit')) {
            throw new Error('Too many signup attempts. Please wait a few minutes and try again.');
          }
          if (error.status === 400 || error.message.toLowerCase().includes('already registered')) {
            throw new Error('Username already taken. Please choose a different one.');
          }
          throw error;
        }
      }
      setUsername('');
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
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 placeholder-neutral-500 focus:border-indigo-500 focus:outline-none w-36"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 placeholder-neutral-500 focus:border-indigo-500 focus:outline-none w-40"
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
          onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); }}
          className="text-xs text-neutral-400 hover:text-neutral-200 underline"
        >
          {mode === 'signin' ? 'Create account' : 'Already have an account?'}
        </button>
      </form>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
};

export default CommunityAuthBar;
