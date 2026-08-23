import { Building2, FileSignature, Landmark, Users } from 'lucide-react';
import type { SectionKey } from '@/shared/schema';

/**
 * One hue and one icon per schema section.
 *
 * This is wayfinding, not decoration. The approval screen is a twenty-four row
 * list and a reviewer moves between it and the document constantly; a colour
 * band tells them where they are without reading a heading. Class strings are
 * written out in full because Tailwind cannot see dynamically composed names.
 */
export interface SectionStyle {
  icon: typeof Building2;
  /** Icon chip. */
  chip: string;
  /** Left rule down the section. */
  rule: string;
  /** Section label colour. */
  label: string;
  /** Tint for the active row in this section. */
  activeRow: string;
}

export const SECTION_STYLES: Record<SectionKey, SectionStyle> = {
  property: {
    icon: Building2,
    chip: 'bg-property-soft text-property ring-1 ring-inset ring-property-ring',
    rule: 'bg-property',
    label: 'text-property',
    activeRow: 'border-property-ring bg-property-soft',
  },
  tenant: {
    icon: Users,
    chip: 'bg-tenantc-soft text-tenantc ring-1 ring-inset ring-tenantc-ring',
    rule: 'bg-tenantc',
    label: 'text-tenantc',
    activeRow: 'border-tenantc-ring bg-tenantc-soft',
  },
  lease: {
    icon: FileSignature,
    chip: 'bg-leasec-soft text-leasec ring-1 ring-inset ring-leasec-ring',
    rule: 'bg-leasec',
    label: 'text-leasec',
    activeRow: 'border-leasec-ring bg-leasec-soft',
  },
  economics: {
    icon: Landmark,
    chip: 'bg-econ-soft text-econ ring-1 ring-inset ring-econ-ring',
    rule: 'bg-econ',
    label: 'text-econ',
    activeRow: 'border-econ-ring bg-econ-soft',
  },
};
