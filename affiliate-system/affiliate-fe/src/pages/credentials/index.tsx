import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Icon from '@components/core-components/icon';
import axiosInstance from 'config/axiosInstance';
import { AFFILIATES_API_URLS } from 'config/apiUrls';

interface Credentials {
  operatorName: string;
  tenantId: string;
  brandId: string | null;
  mode: 'raw' | 'aggregated';
  transport: 'kafka' | 'rest';
  restBaseUrl: string;
  apiToken: string;
  kafka?: {
    brokers: string;
    topic: string;
    username: string;
    password: string;
    securityProtocol: string;
    saslMechanism: string;
  } | null;
}

function Row({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [shown, setShown] = useState(!secret);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="border-b border-gray-100 py-3 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-gray-700">{label}</p>
        <div className="flex items-center gap-2">
          {secret && (
            <button
              type="button"
              onClick={() => setShown((v) => !v)}
              className="text-[11px] font-medium text-gray-600 hover:text-gray-900"
            >
              {shown ? 'Hide' : 'Show'}
            </button>
          )}
          <button
            type="button"
            onClick={copy}
            className="text-[11px] font-medium text-primary hover:text-primary-dark"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <p className="mt-1 break-all font-mono text-[11px] text-gray-900">
        {shown ? value : '•'.repeat(Math.min(value.length, 44))}
      </p>
    </div>
  );
}

export default function CredentialsReveal() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Credentials | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  // React 18 StrictMode mounts effects twice in development. The grant is
  // single-use, so a second request would consume it and show the user an
  // "already used" page for a link they just opened.
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current || !token) return;
    fetched.current = true;
    axiosInstance
      .get(AFFILIATES_API_URLS.REVEAL_CREDENTIALS(token))
      .then((res) => setData(res.data.credentials))
      .catch((err) =>
        setError(
          err?.response?.data?.error ||
            'This link could not be opened. Ask your account manager to issue new credentials.',
        ),
      )
      .finally(() => setLoading(false));
  }, [token]);

  const downloadEnv = () => {
    if (!data) return;
    const lines = [
      `# Affiliar integration — ${data.operatorName}`,
      `AFFILIAR_BASE_URL=${data.restBaseUrl.replace(/\/api$/, '')}`,
      `AFFILIAR_TENANT_ID=${data.tenantId}`,
      data.brandId ? `AFFILIAR_BRAND_ID=${data.brandId}` : '',
      `AFFILIAR_API_TOKEN=${data.apiToken}`,
      data.kafka ? '' : null,
      data.kafka ? `AFFILIAR_KAFKA_BROKERS=${data.kafka.brokers}` : null,
      data.kafka ? `AFFILIAR_KAFKA_TOPIC=${data.kafka.topic}` : null,
      data.kafka ? `AFFILIAR_KAFKA_USERNAME=${data.kafka.username}` : null,
      data.kafka ? `AFFILIAR_KAFKA_PASSWORD=${data.kafka.password}` : null,
    ].filter((l) => l !== null && l !== '');
    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'affiliar.env';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col">
        <p className="text-sm text-gray-600">Opening…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col">
        <div className="lg:hidden mb-10">
          <Icon iconName="affiliarDark" svgProps={{ width: 130, height: 28 }} />
        </div>
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-gray-600">Link closed</p>
        <h1 className="font-display text-4xl leading-tight tracking-tight text-gray-900">
          This link has already <span className="italic text-primary">been used</span>.
        </h1>
        <p className="mt-3 text-sm text-gray-700">{error}</p>
        <Link
          to="/"
          className="mt-8 inline-flex h-[46px] items-center justify-center rounded-lg bg-gray-900 text-sm font-semibold text-white transition-colors hover:bg-black"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col">
      <div className="lg:hidden mb-10">
        <Icon iconName="affiliarDark" svgProps={{ width: 130, height: 28 }} />
      </div>
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-gray-600">
        {data.operatorName}
      </p>
      <h1 className="font-display text-4xl leading-tight tracking-tight text-gray-900">
        Your integration <span className="italic text-primary">credentials</span>.
      </h1>

      <div className="mt-6 rounded-lg border-l-4 border-amber-500 bg-amber-50 px-4 py-3">
        <p className="text-xs leading-relaxed text-amber-900">
          <b>This page won&apos;t open again.</b> Copy these into your configuration now — reloading
          or revisiting the link shows nothing. If you lose them, we issue new ones rather than
          resend these.
        </p>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white px-4">
        <Row label="Base URL" value={data.restBaseUrl.replace(/\/api$/, '')} />
        <Row label="Tenant ID" value={data.tenantId} />
        {data.brandId && <Row label="Brand ID" value={data.brandId} />}
        <Row label="API token" value={data.apiToken} secret />
      </div>

      {data.kafka && (
        <>
          <p className="mt-6 mb-2 text-xs font-semibold uppercase tracking-wider text-gray-600">
            Kafka
          </p>
          <div className="rounded-xl border border-gray-200 bg-white px-4">
            <Row label="Brokers" value={data.kafka.brokers} />
            <Row label="Topic" value={data.kafka.topic} />
            <Row label="Username" value={data.kafka.username} />
            <Row label="Password" value={data.kafka.password} secret />
            <Row label="Security protocol" value={data.kafka.securityProtocol} />
            <Row label="SASL mechanism" value={data.kafka.saslMechanism} />
          </div>
        </>
      )}

      <button
        type="button"
        onClick={downloadEnv}
        className="mt-6 inline-flex h-[46px] items-center justify-center rounded-lg bg-gray-900 text-sm font-semibold text-white transition-colors hover:bg-black"
      >
        Download as .env
      </button>

      <p className="mt-4 text-xs leading-relaxed text-gray-600">
        You&apos;re set up to send <b>{data.mode === 'aggregated' ? 'aggregated activity' : 'raw events'}</b> over{' '}
        <b>{data.transport === 'kafka' ? 'Kafka' : 'REST'}</b>. The documentation walks through the
        event shapes and the order to send them in.
      </p>
    </div>
  );
}
