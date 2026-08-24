import { useEffect, useState } from 'react';
import { useBaseQuery } from 'api/core/useBaseQuery';
import { useBaseMutation } from 'api/core/useBaseMutation';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowPathIcon,
  ClipboardDocumentIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';

import { REFER_API_URLS } from 'config/apiUrls';
import { DELIVERY_EVENT_LABEL } from '../types';
import type { DeliveryEventType } from '../types';

interface Props {
  brandId: string;
}

interface SecretEntry {
  hint: string;
  createdAt: string;
  retiredAt: string | null;
}

interface WebhookConfig {
  enabled: boolean;
  url: string;
  secrets: SecretEntry[];
}

interface TestResult {
  ok: boolean;
  statusCode: number | null;
  latencyMs: number;
  bodySnippet?: string;
  errorMessage?: string;
}

// Same vocabulary the reward ledger uses, so one event isn't called two
// different things on the same screen.
const TEST_EVENTS: { value: DeliveryEventType; label: string }[] = [
  'referral.reward.issued',
  'referral.reward.reversed',
  'referral.reward.referee.issued',
  'referral.reward.recurring.issued',
].map((value) => ({
  value: value as DeliveryEventType,
  label: DELIVERY_EVENT_LABEL[value as DeliveryEventType],
}));

function formatDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

export default function WebhookPanel({ brandId }: Props) {
  const queryClient = useQueryClient();

  const [url, setUrl] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [touched, setTouched] = useState(false);
  // Shown once, right after the server mints it. Never re-fetchable — the API
  // only ever returns the last-4 hint after this point.
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [testEvent, setTestEvent] = useState(TEST_EVENTS[0].value);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useBaseQuery<{ webhook: WebhookConfig }>({
    endpoint: REFER_API_URLS.WEBHOOK(brandId),
    queryKey: ['refer-webhook', brandId],
  });

  const webhook = data?.webhook;

  // Seed the form from the server, but never over unsaved edits — a background
  // refetch landing mid-typing must not reset what the operator is writing.
  useEffect(() => {
    if (!webhook || touched) return;
    setUrl(webhook.url ?? '');
    setEnabled(!!webhook.enabled);
  }, [webhook, touched]);
  const secrets = webhook?.secrets ?? [];
  const activeSecret = secrets.find((s) => !s.retiredAt) ?? null;

  function flash(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(null), 2500);
  }

  const save = useBaseMutation({
    endpoint: REFER_API_URLS.WEBHOOK(brandId),
    method: 'update',
    onSuccess: (res: any) => {
      setError(null);
      setTouched(false);
      if (res?.secret) setRevealedSecret(res.secret);
      flash('Webhook saved.');
      queryClient.invalidateQueries({ queryKey: ['refer-webhook', brandId] });
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error ?? 'Could not save the webhook.');
    },
  } as any);

  const rotate = useBaseMutation({
    endpoint: REFER_API_URLS.WEBHOOK_ROTATE_SECRET(brandId),
    method: 'post',
    onSuccess: (res: any) => {
      setError(null);
      if (res?.secret) setRevealedSecret(res.secret);
      flash('New signing secret issued.');
      queryClient.invalidateQueries({ queryKey: ['refer-webhook', brandId] });
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error ?? 'Could not rotate the secret.');
    },
  } as any);

  const sendTest = useBaseMutation({
    endpoint: REFER_API_URLS.WEBHOOK_TEST(brandId),
    method: 'post',
    onSuccess: (res: any) => {
      setError(null);
      setTestResult(res as TestResult);
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error ?? 'Could not send the test event.');
    },
  } as any);

  function handleSave() {
    if (save.isPending) return;
    setError(null);
    save.mutate({ enabled, url });
  }

  function handleRotate() {
    if (rotate.isPending) return;
    const ok = window.confirm(
      'Issue a new signing secret?\n\n' +
        'The current secret keeps working for 48 hours so you can deploy the new ' +
        'one without dropping in-flight retries. After that, requests signed with ' +
        'the old secret will no longer verify.',
    );
    if (ok) rotate.mutate({});
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(
      () => flash('Copied to clipboard.'),
      () => setError('Could not copy — select the value and copy manually.'),
    );
  }

  if (isLoading) {
    return <div className="p-4 text-sm text-gray-500">Loading webhook settings…</div>;
  }

  const isDirty = touched && (url !== (webhook?.url ?? '') || enabled !== !!webhook?.enabled);

  return (
    <div className="space-y-5 p-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-800">Reward webhook</h3>
        <p className="mt-1 text-xs text-gray-500">
          Off by default: reward events wait in the deliveries queue until your
          backend pulls them. Turn this on and we&apos;ll also POST each event to
          your endpoint as it happens. Whichever arrives first settles the
          reward, so enabling this never double-credits a player.{' '}
          <a
            href="/docs#raf-webhook"
            target="_blank"
            rel="noreferrer"
            className="text-violet-600 underline"
          >
            Integration guide
          </a>
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md bg-red-50 p-3 text-xs text-red-700">
          <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="rounded-md bg-green-50 p-3 text-xs text-green-700">{notice}</div>
      )}

      {revealedSecret && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-800">
            <ExclamationTriangleIcon className="h-4 w-4" />
            Copy this signing secret now — it is shown only once.
          </div>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-white px-2 py-1.5 font-mono text-xs text-gray-800">
              {revealedSecret}
            </code>
            <button
              type="button"
              onClick={() => copy(revealedSecret)}
              className="flex items-center gap-1 rounded bg-amber-600 px-2 py-1.5 text-xs text-white hover:bg-amber-700"
            >
              <ClipboardDocumentIcon className="h-3.5 w-3.5" />
              Copy
            </button>
          </div>
          <button
            type="button"
            onClick={() => setRevealedSecret(null)}
            className="mt-2 text-xs text-amber-700 underline"
          >
            I&apos;ve stored it safely
          </button>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-700">Endpoint URL</label>
        <input
          type="url"
          value={url}
          placeholder="https://api.your-casino.com/internal/affiliar-rewards"
          onChange={(e) => {
            setTouched(true);
            setUrl(e.target.value);
          }}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
        />
        <p className="mt-1 text-xs text-gray-400">
          Must be HTTPS. Reward payloads carry player ids and amounts.
        </p>
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setTouched(true);
            setEnabled(e.target.checked);
          }}
          className="h-4 w-4 rounded border-gray-300 text-violet-600"
        />
        <span className="text-sm text-gray-700">Deliver reward events to this endpoint</span>
      </label>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || save.isPending}
          className="rounded-md bg-violet-600 px-3 py-2 text-sm text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>

      {secrets.length > 0 && (
        <div className="border-t border-gray-100 pt-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-gray-700">Signing secrets</h4>
            <button
              type="button"
              onClick={handleRotate}
              disabled={rotate.isPending}
              className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              <ArrowPathIcon className="h-3.5 w-3.5" />
              {rotate.isPending ? 'Rotating…' : 'Rotate'}
            </button>
          </div>
          <ul className="mt-2 space-y-1">
            {secrets.map((s) => (
              <li
                key={`${s.hint}-${s.createdAt}`}
                className="flex items-center justify-between rounded bg-gray-50 px-2 py-1.5 text-xs"
              >
                <code className="font-mono text-gray-700">whsec_…{s.hint}</code>
                <span className="text-gray-500">
                  {s.retiredAt
                    ? `retired ${formatDate(s.retiredAt)} — still valid briefly`
                    : `active since ${formatDate(s.createdAt)}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {webhook?.url && activeSecret && (
        <div className="border-t border-gray-100 pt-4">
          <h4 className="text-xs font-semibold text-gray-700">Send a test event</h4>
          <p className="mt-1 text-xs text-gray-500">
            Signed like a real event and flagged <code className="font-mono">test: true</code>.
            Nothing is recorded and no player is credited.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <select
              value={testEvent}
              onChange={(e) => setTestEvent(e.target.value as DeliveryEventType)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-xs"
            >
              {TEST_EVENTS.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setTestResult(null);
                sendTest.mutate({ eventType: testEvent });
              }}
              disabled={sendTest.isPending}
              className="rounded-md border border-violet-600 px-3 py-1.5 text-xs text-violet-700 hover:bg-violet-50 disabled:opacity-40"
            >
              {sendTest.isPending ? 'Sending…' : 'Send test'}
            </button>
          </div>

          {testResult && (
            <div
              className={`mt-3 rounded-md p-3 text-xs ${
                testResult.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
              }`}
            >
              <div className="flex items-center gap-1.5 font-semibold">
                {testResult.ok ? (
                  <CheckCircleIcon className="h-4 w-4" />
                ) : (
                  <XCircleIcon className="h-4 w-4" />
                )}
                {testResult.ok
                  ? `Your endpoint accepted the event (${testResult.statusCode})`
                  : testResult.statusCode
                    ? `Your endpoint answered ${testResult.statusCode}`
                    : 'Could not reach your endpoint'}
                <span className="font-normal opacity-70">· {testResult.latencyMs} ms</span>
              </div>
              {(testResult.errorMessage || testResult.bodySnippet) && (
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded bg-white/60 p-2 font-mono">
                  {testResult.errorMessage || testResult.bodySnippet}
                </pre>
              )}
              {!testResult.ok && (
                <p className="mt-2 opacity-80">
                  We retry failed deliveries six times over ~38 hours before marking
                  them failed. Queued events are never lost — you can still pull them.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
