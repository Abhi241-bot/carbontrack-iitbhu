import { Layers, Ruler, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { BuildingType, SubmissionStatus } from '@shared/types/building.types';
import { UserRole } from '@shared/types/user.types';
import Badge from '@/components/common/Badge';
import Card from '@/components/common/Card';
import Button from '@/components/common/Button';
import { formatNumber } from '@/utils/formatters';
import { membershipRequestsApi } from '@/features/membershipRequests/membershipRequestsApi';
import { useAuthStore } from '@/features/auth/authStore';
import { useToast } from '@/hooks/useToast';

interface AssignedMember {
  _id: string;
  name: string;
  email: string;
  department?: string;
}

interface BuildingCardProps {
  building: {
    _id: string;
    name: string;
    shortName?: string;
    type: BuildingType;
    floors: number;
    totalArea?: number;
    submissionStatus: SubmissionStatus;
    assignedMembers: AssignedMember[];
    tags: string[];
  };
  userAssignedBuildingIds?: string[];
}

const statusVariantMap: Record<
  SubmissionStatus,
  'default' | 'success' | 'warning' | 'danger' | 'info'
> = {
  [SubmissionStatus.NOT_STARTED]: 'default',
  [SubmissionStatus.DRAFT]: 'warning',
  [SubmissionStatus.SUBMITTED]: 'info',
  [SubmissionStatus.UNDER_REVIEW]: 'info',
  [SubmissionStatus.VERIFIED]: 'success',
  [SubmissionStatus.REVISION_REQUESTED]: 'danger',
};

const statusLabelMap: Record<SubmissionStatus, string> = {
  [SubmissionStatus.NOT_STARTED]: 'Not Started',
  [SubmissionStatus.DRAFT]: 'Draft',
  [SubmissionStatus.SUBMITTED]: 'Submitted',
  [SubmissionStatus.UNDER_REVIEW]: 'Under Review',
  [SubmissionStatus.VERIFIED]: 'Verified',
  [SubmissionStatus.REVISION_REQUESTED]: 'Revision Needed',
};

export default function BuildingCard({
  building,
  userAssignedBuildingIds = [],
}: BuildingCardProps) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { showToast } = useToast();
  const isAssigned = userAssignedBuildingIds.includes(building._id);
  const canRequest = !!user && user.role !== UserRole.ADMIN && !isAssigned;

  const requestMutation = useMutation({
    mutationFn: () => membershipRequestsApi.create(building._id),
    onSuccess: () => showToast({ type: 'success', message: 'Membership request sent to admin' }),
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast({
        type: 'error',
        message: err.response?.data?.message ?? 'Failed to send request',
      });
    },
  });

  return (
    <Card
      hover
      padding="md"
      onClick={() => navigate(`/buildings/${building._id}`)}
      className="flex flex-col gap-3"
    >
      {/* Top row */}
      <div className="flex items-center justify-between">
        <Badge variant="building-type" buildingType={building.type} label={building.type} />
        <Badge
          variant={statusVariantMap[building.submissionStatus]}
          label={statusLabelMap[building.submissionStatus]}
        />
      </div>

      {/* Body */}
      <div>
        <p className="text-lg font-semibold text-gray-900 truncate">{building.name}</p>
        {building.shortName && building.shortName !== building.name && (
          <p className="text-sm text-gray-500">{building.shortName}</p>
        )}
        <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500">
          <span className="flex items-center gap-1">
            <Layers className="h-3.5 w-3.5" />
            {building.floors} floor{building.floors !== 1 ? 's' : ''}
          </span>
          {building.totalArea && (
            <span className="flex items-center gap-1">
              <Ruler className="h-3.5 w-3.5" />
              {formatNumber(building.totalArea)} sqm
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {building.assignedMembers.length} member
            {building.assignedMembers.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Bottom row */}
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-100">
        {isAssigned ? (
          <>
            <Badge variant="success" label="Your Building" />
            <Button
              size="sm"
              variant="primary"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/buildings/${building._id}`);
              }}
            >
              Fill Data →
            </Button>
          </>
        ) : (
          <div className="flex items-center justify-between w-full">
            <span className="text-sm text-iitbhu font-medium hover:underline cursor-pointer">
              View Details →
            </span>
            {canRequest && (
              <Button
                size="sm"
                variant="outline"
                isLoading={requestMutation.isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  requestMutation.mutate();
                }}
              >
                Request Access
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
