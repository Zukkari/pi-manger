import { ActivityFeedWidget } from '@/features/activity';
import { DiskUsageWidget } from '@/features/disk-usage';
import { AddDownloadButton, DownloadsList } from '@/features/downloads';
import { FileTypesWidget } from '@/features/file-types';
import { SpaceMapWidget } from '@/features/space-map';
import { LayoutDashboard } from '@/layouts/LayoutDashboard';
import { PageHeading } from '@/shared/ui/PageHeading';

export const PageDashboard = () => (
  <LayoutDashboard>
    <PageHeading>Dashboard</PageHeading>
    <DiskUsageWidget />
    <SpaceMapWidget />
    <FileTypesWidget />
    <ActivityFeedWidget />
    <DownloadsList />
    <AddDownloadButton />
  </LayoutDashboard>
);
