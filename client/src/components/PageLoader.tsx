import { Skeleton } from "@/components/ui/skeleton";

export function PageLoader() {
  return (
    <div className="p-6 space-y-4" data-testid="loader-page">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-4 w-1/2" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-64 mt-4" />
    </div>
  );
}

export default PageLoader;
