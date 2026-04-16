// client/src/components/StatusBadge.jsx

import { Badge } from '@/components/ui/badge';

const STATUS_CONFIG = {
  pending:   { label: 'Pending',   variant: 'pending'     },
  issued:    { label: 'Issued',    variant: 'warning'     },
  completed: { label: 'Completed', variant: 'default'     },
  checked:   { label: 'Checked',   variant: 'success'     },
};

export default function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
