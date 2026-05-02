export type NavLinkItem = {
  id: string;
  label: string;
  href: string;
  description?: string;
};

export type NavGroup = {
  id: string;
  items: NavLinkItem[];
};

export type PrimaryNavItem = {
  id: string;
  label: string;
  href?: string;
  matchPrefix?: string;
  showChevron?: boolean;
  groups?: NavGroup[];
};
