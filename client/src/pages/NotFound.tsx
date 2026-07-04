import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8f6f0] px-4 text-center">
      <p className="text-9xl font-black text-gray-200 select-none leading-none mb-4">404</p>
      <h1 className="text-2xl font-bold text-white mb-2">Page not found</h1>
      <p className="text-gray-400 mb-8">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-iitbhu text-white font-medium hover:bg-iitbhu-dark transition-colors no-underline"
      >
        Back to Home
      </Link>
    </div>
  );
}
