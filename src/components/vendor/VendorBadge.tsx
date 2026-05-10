import { Badge } from '@/components/ui/badge'

interface VendorBadgeProps {
  vendorName: string | null | undefined
  className?: string
}

export function VendorBadge({ vendorName, className }: VendorBadgeProps) {
  if (!vendorName) return null

  return (
    <Badge variant="outline" className={`text-xs ${className ?? ''}`}>
      {vendorName}
    </Badge>
  )
}
