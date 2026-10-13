import { TransportAssistant } from './components/TransportAssistant';
import { Train } from 'lucide-react';

function App() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Train className="w-12 h-12 text-blue-600" aria-hidden="true" />
            <h1 className="text-4xl font-bold text-gray-900">India Transport Assistant</h1>
          </div>
          <p className="text-gray-600 text-lg">Metro, train, bus and traffic-aware routes for Indian cities, powered by AI</p>
        </header>

        <TransportAssistant />
      </div>
    </main>
  );
}

export default App;
