import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { register } from '@/lib/api';
import { Zap } from 'lucide-react';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const { login, isLoading, error } = useAuthStore();
  const [localError, setLocalError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError('');
    try {
      if (isRegister) {
        await register(email, password);
      }
      await login(email, password);
      navigate('/');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Something went wrong');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-background)',
      }}
    >
      <div
        style={{
          width: 400,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 40,
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              background: 'var(--color-accent)',
              borderRadius: 'var(--radius-sm)',
              padding: 8,
              display: 'flex',
            }}
          >
            <Zap size={20} color="white" />
          </div>
          <span style={{ fontSize: 22, fontWeight: 700 }}>Sentient Flow</span>
        </div>

        <h2
          style={{
            textAlign: 'center',
            fontSize: 16,
            fontWeight: 500,
            color: 'var(--color-text-secondary)',
            margin: '0 0 24px',
          }}
        >
          {isRegister ? 'Create your account' : 'Welcome back'}
        </h2>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={inputStyle}
            />
          </div>

          {(error || localError) && (
            <div
              style={{
                background: 'var(--color-error)15',
                border: '1px solid var(--color-error)33',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 12px',
                marginBottom: 16,
                fontSize: 13,
                color: 'var(--color-error)',
              }}
            >
              {localError || error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '10px 16px',
              background: isLoading ? 'var(--color-surface-active)' : 'var(--color-accent)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontSize: 14,
              fontWeight: 600,
              cursor: isLoading ? 'wait' : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {isLoading ? 'Loading...' : isRegister ? 'Register' : 'Login'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13 }}>
          <span style={{ color: 'var(--color-text-muted)' }}>
            {isRegister ? 'Already have an account?' : "Don't have an account?"}
          </span>{' '}
          <button
            onClick={() => {
              setIsRegister(!isRegister);
              setLocalError('');
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-accent)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            {isRegister ? 'Login' : 'Register'}
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--color-text-secondary)',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: 'var(--color-background)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--color-text-primary)',
  fontSize: 14,
  outline: 'none',
};
