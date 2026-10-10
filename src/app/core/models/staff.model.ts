export type UserRole = 'owner' | 'manager' | 'waiter' | 'kitchen';

export interface RoleDefinition {
  key: UserRole;
  label: string;
  description: string;
  icon: string;
  badgeClass: string;
  allowedRoutes: string[];
}

export const ROLE_DEFINITIONS: Record<UserRole, RoleDefinition> = {
  owner: {
    key: 'owner',
    label: 'Właściciel',
    description: 'Pełne uprawnienia administracyjne, raporty finansowe, pracownicy i konfiguracja lokalu.',
    icon: 'admin_panel_settings',
    badgeClass: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50',
    allowedRoutes: ['/dashboard', '/tables', '/orders', '/promotions', '/inventory', '/recipes', '/dishes', '/staff']
  },
  manager: {
    key: 'manager',
    label: 'Menedżer Sali',
    description: 'Zarządzanie salą, personelem, magazynem oraz podgląd raportów dziennych.',
    icon: 'manage_accounts',
    badgeClass: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50',
    allowedRoutes: ['/dashboard', '/tables', '/orders', '/promotions', '/inventory', '/recipes', '/dishes', '/staff']
  },
  waiter: {
    key: 'waiter',
    label: 'Kelner / Kasjer',
    description: 'Obsługa stolików, wprowadzanie zamówień (kasa POS), wydawka dań oraz menu.',
    icon: 'person',
    badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50',
    allowedRoutes: ['/tables', '/orders', '/dishes']
  },
  kitchen: {
    key: 'kitchen',
    label: 'Kucharz / Pizzer',
    description: 'Tablica realizacji zamówień w kuchni (KDS) oraz podgląd księgi receptur.',
    icon: 'soup_kitchen',
    badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50',
    allowedRoutes: ['/orders', '/recipes']
  }
};

export interface StaffMember {
  id: string;
  restaurantId: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  pin?: string;
  active: boolean;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateStaffMemberDto {
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  notes?: string;
}
