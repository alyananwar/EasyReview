import Link from "next/link";

export default function TermsPage() {
  const shop = process.env.BUSINESS_NAME || "This business";
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-semibold mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-400 mb-8">Last updated: May 2026</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-gray-300">
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">
              SMS Communications
            </h2>
            <p>
              By providing your phone number as part of a transaction with{" "}
              {shop}, you consent to receive a single SMS message requesting a
              Google review. Message and data rates may apply.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">Frequency</h2>
            <p>
              You will receive at most one review request per visit, with a
              minimum of 90 days between messages.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">
              Opting Out
            </h2>
            <p>
              Reply <strong>STOP</strong> to opt out at any time. Reply{" "}
              <strong>HELP</strong> for assistance.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">
              No Warranties
            </h2>
            <p>
              This service is provided as-is. {shop} is not responsible for
              carrier delays or message delivery failures outside of our
              control.
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
