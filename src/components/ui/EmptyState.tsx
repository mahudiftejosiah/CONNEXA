import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 px-6 text-center", className)}>
      {icon && (
        <div className="w-16 h-16 rounded-2xl bg-brand-green-800/10 dark:bg-brand-gold-400/10 flex items-center justify-center mb-4 text-brand-green-800 dark:text-brand-gold-400">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-[var(--text-secondary)] max-w-xs mb-6">{description}</p>
      )}
      {action}
    </div>
  );
}
