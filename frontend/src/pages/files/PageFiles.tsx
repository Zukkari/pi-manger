import { FileBrowserWidget } from '@/features/files';
import { LayoutDashboard } from '@/layouts/LayoutDashboard';
import { PageHeading } from '@/shared/ui/PageHeading';

export const PageFiles = () => (
  <LayoutDashboard>
    <PageHeading>Files</PageHeading>
    <FileBrowserWidget />
  </LayoutDashboard>
);
