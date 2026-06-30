import { Link } from 'react-router-dom';

interface Props {
  message: string;
  callToAction: string;
  ctaLink: string;
}

function LeafIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="mx-auto mb-3 opacity-40"
    >
      <path
        d="M8 32C8 32 10 20 20 14C30 8 34 10 34 10C34 10 32 22 22 28C14 33 8 32 8 32Z"
        stroke="#15803D"
        strokeWidth="2"
        fill="#dcfce7"
      />
      <path d="M8 32C12 28 17 24 22 18" stroke="#15803D" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function AnalyticsEmptyState({ message, callToAction, ctaLink }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-48 text-center px-4">
      <LeafIcon />
      <p className="text-sm text-gray-500">{message}</p>
      <Link
        to={ctaLink}
        className="mt-3 text-sm font-medium hover:underline"
        style={{ color: '#8B1A1A' }}
      >
        {callToAction}
      </Link>
    </div>
  );
}
