import { Link } from 'react-router-dom';

export default function NoDataOverlay() {
  return (
    <div className="flex flex-col items-center justify-center h-48 text-center gap-2">
      <p className="text-sm font-medium text-gray-400">No verified submissions yet</p>
      <p className="text-xs text-gray-400">Submit your building data to see analytics</p>
      <Link
        to="/buildings"
        className="text-xs text-iitbhu hover:underline mt-1"
        style={{ color: '#8B1A1A' }}
      >
        View buildings
      </Link>
    </div>
  );
}
