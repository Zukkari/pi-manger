export interface BreadcrumbCrumb {
  id: number;
  name: string;
}

interface LargestFilesBreadcrumbProps {
  path: BreadcrumbCrumb[];
  onCrumbClick: (index: number) => void;
}

const crumbButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  font: 'inherit',
  color: 'var(--paper-link, #3b82f6)',
  cursor: 'pointer',
  textDecoration: 'underline',
};

export const LargestFilesBreadcrumb = ({ path, onCrumbClick }: LargestFilesBreadcrumbProps) => (
  <nav aria-label="Folder path" style={{ marginBottom: 12, fontSize: 13 }}>
    <button type="button" style={crumbButtonStyle} onClick={() => onCrumbClick(-1)}>
      Root
    </button>
    {path.map((crumb, i) => (
      <span key={crumb.id}>
        <span style={{ margin: '0 6px', color: 'var(--paper-border-bold)' }}>/</span>
        {i === path.length - 1 ? (
          <span aria-current="page" style={{ fontWeight: 600 }}>{crumb.name}</span>
        ) : (
          <button type="button" style={crumbButtonStyle} onClick={() => onCrumbClick(i)}>
            {crumb.name}
          </button>
        )}
      </span>
    ))}
  </nav>
);
