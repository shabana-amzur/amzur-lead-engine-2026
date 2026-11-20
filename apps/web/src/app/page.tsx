export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            Amzur Lead Engine
          </h1>
          <p className="text-xl text-gray-600">
            Discover and manage leads automatically
          </p>
        </div>

        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="text-primary-600 text-3xl mb-4">🎯</div>
            <h3 className="text-xl font-semibold mb-2">Lead Discovery</h3>
            <p className="text-gray-600">
              Automated daily lead discovery using intelligent algorithms
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="text-primary-600 text-3xl mb-4">📊</div>
            <h3 className="text-xl font-semibold mb-2">Analytics</h3>
            <p className="text-gray-600">
              Track and analyze lead performance with detailed insights
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="text-primary-600 text-3xl mb-4">🔒</div>
            <h3 className="text-xl font-semibold mb-2">Secure Access</h3>
            <p className="text-gray-600">
              JWT-based authentication for admin management
            </p>
          </div>
        </div>

        <div className="text-center mt-12">
          <a
            href="/dashboard"
            className="inline-block bg-primary-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-primary-700 transition-colors"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    </main>
  )
}
