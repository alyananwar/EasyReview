import Link from "next/link";

export default function PrivacyPage() {
  const shop = process.env.BUSINESS_NAME || "This business";
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-semibold mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-400 mb-8">Last updated: May 2026</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-gray-300">
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">
              Information We Collect
            </h2>
            <p>
              {shop} collects your name and phone number from QuickBooks when
              you have a completed invoice with us. We use this information only
              to send you a one-time review request via SMS.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">
              How We Use Your Information
            </h2>
            <p>
              Your phone number is used solely to send you a single SMS
              requesting a Google review. We do not sell, share, or use your
              information for any other purpose.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">
              Opting Out
            </h2>
            <p>
              Reply <strong>STOP</strong> to any message to opt out. You will
              not receive further messages. You may also contact us directly to
              be removed from our list.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">
              Data Retention
            </h2>
            <p>
              We retain your name and phone number only as long as necessary to
              manage review request history and honor opt-out requests.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">Contact</h2>
            <p>
              Questions about this policy? Contact us at the phone number or
              address on your invoice.
            </p>
          </section>
        </div>

        <Link
          href="/"
          className="inline-block mt-8 text-sm text-blue-400 hover:text-blue-300"
        >
          ← Back to dashboard
        </Link>
      </div>
    </div>
  );
}
