/* eslint-disable */
function CookiePolicy() {
  return (
    <div className="prose prose-gray max-w-none">
      <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Cookie Policy</h1>
      <p className="text-sm text-gray-500 mb-8">Effective date: April 2, 2026 · Last updated: April 2, 2026</p>

      <section className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-3">1. What Are Cookies?</h2>
        <p className="text-gray-600 leading-relaxed">
          Cookies are small text files placed on your device when you visit a website. They are widely used to make
          websites work efficiently, remember your preferences, and provide analytical information to site owners.
          Cookies may be &quot;session&quot; cookies (deleted when you close your browser) or &quot;persistent&quot; cookies (remain for
          a defined period or until you delete them).
        </p>
        <p className="text-gray-600 leading-relaxed mt-3">
          Similar technologies — including web beacons, pixel tags, local storage objects, and device fingerprinting —
          may be used alongside cookies for equivalent purposes. This policy covers all such technologies collectively
          referred to as &quot;cookies&quot;.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-3">2. How We Use Cookies</h2>
        <p className="text-gray-600 leading-relaxed">
          Affiliar uses cookies for the following purposes:
        </p>

        <div className="mt-4 space-y-6">
          <div className="border border-gray-200 rounded-xl p-5 bg-white">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">Always Active</span>
              <h3 className="text-base font-bold text-gray-800">Strictly Necessary Cookies</h3>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              These cookies are essential for the platform to function. They enable core features such as authentication
              sessions, security tokens, load balancing, and user interface state. You cannot opt out of these cookies
              as the Service cannot be provided without them.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs text-gray-600 border border-gray-100 rounded-lg">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-2 font-semibold">Cookie Name</th>
                    <th className="text-left p-2 font-semibold">Purpose</th>
                    <th className="text-left p-2 font-semibold">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="p-2 font-mono">aff_session</td>
                    <td className="p-2">Maintains authenticated user session</td>
                    <td className="p-2">Session</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="p-2 font-mono">aff_csrf</td>
                    <td className="p-2">Cross-site request forgery protection token</td>
                    <td className="p-2">Session</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-mono">aff_2fa</td>
                    <td className="p-2">Two-factor authentication state</td>
                    <td className="p-2">Session</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="p-2 font-mono">aff_tz</td>
                    <td className="p-2">User's selected timezone preference</td>
                    <td className="p-2">1 year</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="border border-gray-200 rounded-xl p-5 bg-white">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700">Functional</span>
              <h3 className="text-base font-bold text-gray-800">Functional Cookies</h3>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              These cookies remember your choices and personalise your experience on the platform. Disabling them may
              cause some features — such as saved layout preferences or language settings — to stop working correctly.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs text-gray-600 border border-gray-100 rounded-lg">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-2 font-semibold">Cookie Name</th>
                    <th className="text-left p-2 font-semibold">Purpose</th>
                    <th className="text-left p-2 font-semibold">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="p-2 font-mono">aff_lang</td>
                    <td className="p-2">Stores selected UI language</td>
                    <td className="p-2">1 year</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="p-2 font-mono">aff_layout</td>
                    <td className="p-2">Saves custom dashboard widget layout</td>
                    <td className="p-2">1 year</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-mono">aff_sidebar</td>
                    <td className="p-2">Remembers sidebar collapsed/expanded state</td>
                    <td className="p-2">30 days</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="border border-gray-200 rounded-xl p-5 bg-white">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700">Analytics</span>
              <h3 className="text-base font-bold text-gray-800">Analytics and Performance Cookies</h3>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              These cookies help us understand how Affiliates use the platform so we can improve its performance,
              stability, and usability. Data collected is aggregated and pseudonymised. We use this information to
              identify popular features, detect errors, and prioritise development.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs text-gray-600 border border-gray-100 rounded-lg">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-2 font-semibold">Provider</th>
                    <th className="text-left p-2 font-semibold">Purpose</th>
                    <th className="text-left p-2 font-semibold">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="p-2">Affiliar Internal Analytics</td>
                    <td className="p-2">Platform usage and feature performance tracking</td>
                    <td className="p-2">12 months</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="p-2">Error monitoring (e.g. Sentry)</td>
                    <td className="p-2">Captures JavaScript errors and performance metrics</td>
                    <td className="p-2">Session</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="border border-gray-200 rounded-xl p-5 bg-white">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700">Tracking</span>
              <h3 className="text-base font-bold text-gray-800">Affiliate Tracking Cookies</h3>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              These cookies are the foundation of the Affiliar product. They are set when an end-user (Referred Player)
              clicks an Affiliate's tracking link and enable accurate attribution of registrations, deposits, and
              activity to the correct Affiliate account. These cookies are set under Operator domains and governed by
              the Operator's own cookie policy.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs text-gray-600 border border-gray-100 rounded-lg">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-2 font-semibold">Cookie Name</th>
                    <th className="text-left p-2 font-semibold">Purpose</th>
                    <th className="text-left p-2 font-semibold">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="p-2 font-mono">aff_ref</td>
                    <td className="p-2">Stores the Affiliate reference ID for player attribution</td>
                    <td className="p-2">30 days</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="p-2 font-mono">aff_click</td>
                    <td className="p-2">Records the click identifier and timestamp for conversion tracking</td>
                    <td className="p-2">30 days</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-mono">aff_src</td>
                    <td className="p-2">Captures traffic source for campaign performance reporting</td>
                    <td className="p-2">30 days</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-3">3. Third-Party Cookies</h2>
        <p className="text-gray-600 leading-relaxed">
          Some cookies on the Affiliar platform are set by third-party services we use to deliver, secure, and improve
          the product. Each third-party provider has its own privacy and cookie policy. We encourage you to review
          those policies directly.
        </p>
        <p className="text-gray-600 leading-relaxed mt-3">
          Affiliar does not control third-party cookies and is not responsible for their operation. We review our
          third-party integrations periodically to ensure they meet our data protection standards.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-3">4. Managing Your Cookie Preferences</h2>
        <p className="text-gray-600 leading-relaxed">
          You can control and manage cookies in several ways:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-600 mt-3">
          <li>
            <strong>Browser settings:</strong> Most browsers allow you to view, block, or delete cookies through their
            settings menus. Note that blocking strictly necessary cookies will prevent the platform from functioning.
          </li>
          <li>
            <strong>Cookie consent banner:</strong> When you first access the Affiliar platform, you will be presented
            with a cookie consent notice where you can accept or reject non-essential cookies.
          </li>
          <li>
            <strong>Opt-out tools:</strong> For analytics cookies provided by third parties, you may use industry
            opt-out tools such as the Network Advertising Initiative opt-out or Google Analytics opt-out browser
            add-on where applicable.
          </li>
        </ul>
        <p className="text-gray-600 leading-relaxed mt-3">
          Please be aware that disabling certain cookies may affect the functionality of the Affiliar platform and
          your ability to track commissions and campaign performance accurately.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-3">5. Do Not Track</h2>
        <p className="text-gray-600 leading-relaxed">
          Some browsers include a &quot;Do Not Track&quot; (DNT) setting. Affiliar does not currently respond to DNT signals as
          there is no industry-wide standard for honouring these requests. We will revisit this position if a common
          standard emerges.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-3">6. Changes to This Policy</h2>
        <p className="text-gray-600 leading-relaxed">
          We may update this Cookie Policy as the platform evolves or when new legal requirements apply. Updates will
          be reflected in the "Last updated" date at the top of this page. Material changes will be communicated via
          in-platform notification or email.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-3">7. Contact</h2>
        <p className="text-gray-600 leading-relaxed">
          If you have questions about our use of cookies, please contact:
        </p>
        <address className="not-italic text-gray-600 mt-2 space-y-1">
          <p className="font-medium">Affiliar Ltd.</p>
          <p>Email: <a href="mailto:dpo@affiliar.io" className="text-blue-600 underline">dpo@affiliar.io</a></p>
        </address>
      </section>
    </div>
  );
}

export default CookiePolicy;
