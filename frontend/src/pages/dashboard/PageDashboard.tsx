import { DiskUsageBar, useDiskUsage } from '@/features/disk-usage';

const PageDashboard = () => {
  const { data, isLoading, isError } = useDiskUsage();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-blue-500 animate-spin" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-sm text-red-500">
        Failed to load disk usage. Is the API running?
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-gray-800 tracking-tight">Dashboard</h1>
      <DiskUsageBar data={data} />
    </div>
  );
};

export default PageDashboard;
