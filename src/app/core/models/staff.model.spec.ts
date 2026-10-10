import { ROLE_DEFINITIONS, UserRole } from './staff.model';

describe('Staff RBAC Models & Definitions', () => {
  it('powinien zawierać kompletne definicje dla wszystkich 4 ról systemowych', () => {
    const roles: UserRole[] = ['owner', 'manager', 'waiter', 'kitchen'];

    roles.forEach(role => {
      const def = ROLE_DEFINITIONS[role];
      expect(def).toBeDefined();
      expect(def.key).toBe(role);
      expect(def.label).toBeTruthy();
      expect(def.allowedRoutes.length).toBeGreaterThan(0);
      expect(def.icon).toBeTruthy();
    });
  });

  it('rola waiter (kelner) powinna mieć dostęp do stolików i zamówień, ale NIE do magazynu ani zespołu', () => {
    const waiterRoutes = ROLE_DEFINITIONS.waiter.allowedRoutes;
    expect(waiterRoutes).toContain('/tables');
    expect(waiterRoutes).toContain('/orders');
    expect(waiterRoutes).toContain('/dishes');

    expect(waiterRoutes).not.toContain('/inventory');
    expect(waiterRoutes).not.toContain('/staff');
    expect(waiterRoutes).not.toContain('/dashboard');
  });

  it('rola kitchen (kuchnia) powinna mieć dostęp wyłącznie do KDS i receptur', () => {
    const kitchenRoutes = ROLE_DEFINITIONS.kitchen.allowedRoutes;
    expect(kitchenRoutes).toContain('/orders');
    expect(kitchenRoutes).toContain('/recipes');

    expect(kitchenRoutes).not.toContain('/tables');
    expect(kitchenRoutes).not.toContain('/staff');
    expect(kitchenRoutes).not.toContain('/inventory');
    expect(kitchenRoutes).not.toContain('/dashboard');
  });

  it('rola owner (właściciel) powinna posiadać pełen dostęp do wszystkich modułów', () => {
    const ownerRoutes = ROLE_DEFINITIONS.owner.allowedRoutes;
    const requiredModules = ['/dashboard', '/tables', '/orders', '/promotions', '/inventory', '/recipes', '/dishes', '/staff'];
    requiredModules.forEach(mod => {
      expect(ownerRoutes).toContain(mod);
    });
  });
});
