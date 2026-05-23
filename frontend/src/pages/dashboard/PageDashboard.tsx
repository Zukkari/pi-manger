import { DiskUsageWidget } from '@/features/disk-usage';
import { LargestFilesWidget } from '@/features/largest-files';
import { LayoutDashboard } from '@/layouts/LayoutDashboard';
import { PageHeading } from '@/shared/ui/PageHeading';

export const PageDashboard = () => (
  <LayoutDashboard>
    <PageHeading>Dashboard</PageHeading>
    <DiskUsageWidget />
    <LargestFilesWidget />
  </LayoutDashboard>
);
