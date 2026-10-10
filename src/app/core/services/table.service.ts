import { Injectable, inject, signal, computed, effect } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  onSnapshot,
  getDocs,
  writeBatch,
  Unsubscribe
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { OrderService } from './order.service';
import { ToastService } from './toast.service';
import { RestaurantTable, TableStatus, TableZone } from '../models/table.model';
import { Order, OrderStatus } from '../models/order.model';

@Injectable({
  providedIn: 'root'
})
export class TableService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private orderService = inject(OrderService);
  private toastService = inject(ToastService);

  readonly tables = signal<RestaurantTable[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly selectedZone = signal<string>('all');

  private firestoreUnsub: Unsubscribe | null = null;

  // Reaktywne połączenie z zamówieniami na żywo (Live Order Binding)
  // Reaktywne połączenie z zamówieniami na żywo (Live Order Binding)
  // Obsługa wielu transzy (bony kuchenne / domawianie w trakcie wizyty gości):
  // Rachunek stolika automatycznie sumuje wszystkie zamówienia złożone podczas aktywnej wizyty.
  readonly tablesWithLiveStatus = computed<RestaurantTable[]>(() => {
    const rawTables = this.tables();
    const orders = this.orderService.orders();

    return rawTables.map(tbl => {
      // Jeśli stolik jest wolny lub czeka na posprzątanie, nie ma aktywnego rachunku
      if (tbl.status === 'free' || tbl.status === 'dirty') {
        return {
          ...tbl,
          currentOrderId: undefined,
          currentOrderNumber: undefined,
          currentOrderTotal: undefined,
          currentOrderItemsCount: undefined,
          activeOrderIds: undefined,
          ordersCount: 0,
          kitchenOrderStatus: undefined,
          occupiedSince: undefined
        };
      }

      // Dla stolika zajętego lub z prośbą o rachunek szukamy wszystkich zamówień z tej wizyty
      const activeIds = new Set(tbl.activeOrderIds || []);
      if (tbl.currentOrderId) activeIds.add(tbl.currentOrderId);

      const matchingOrders = orders.filter(o => {
        if (o.status === 'cancelled') return false;
        if (activeIds.has(o.id)) return true;
        if (o.tableNumber.trim().toLowerCase() === tbl.number.trim().toLowerCase()) {
          if (!tbl.occupiedSince) return true;
          const visitStart = new Date(tbl.occupiedSince).getTime() - (2 * 60 * 1000);
          return new Date(o.createdAt).getTime() >= visitStart;
        }
        return false;
      });

      // Sortuj chronologicznie od najstarszego (Bon #1) do najnowszego (Bon #N)
      matchingOrders.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      if (matchingOrders.length > 0) {
        const latestOrder = matchingOrders[matchingOrders.length - 1];
        const total = matchingOrders.reduce((sum, o) => sum + o.totalPrice, 0);
        const itemsCount = matchingOrders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0);

        // Wyznaczenie łącznego stanu kuchni (od najwyższego priorytetu uwagi):
        // 1. Jeśli jakiekolwiek danie czeka gotowe do odebrania -> 'ready'
        // 2. Jeśli jakiekolwiek danie się gotuje -> 'in_progress'
        // 3. Jeśli jakiekolwiek czeka w kolejce -> 'pending'
        // 4. Jeśli wszystkie wydane na stół -> 'completed'
        let kitchenStatus: OrderStatus = 'completed';
        if (matchingOrders.some(o => o.status === 'ready')) {
          kitchenStatus = 'ready';
        } else if (matchingOrders.some(o => o.status === 'in_progress')) {
          kitchenStatus = 'in_progress';
        } else if (matchingOrders.some(o => o.status === 'pending')) {
          kitchenStatus = 'pending';
        }

        return {
          ...tbl,
          currentOrderId: latestOrder.id,
          currentOrderNumber: latestOrder.orderNumber,
          currentOrderTotal: total,
          currentOrderItemsCount: itemsCount,
          activeOrderIds: matchingOrders.map(o => o.id),
          ordersCount: matchingOrders.length,
          kitchenOrderStatus: kitchenStatus,
          occupiedSince: tbl.occupiedSince || matchingOrders[0].createdAt
        };
      }

      // Stolik zajęty bez aktywnego zamówienia (np. goście właśnie usiedli)
      return {
        ...tbl,
        ordersCount: 0
      };
    });
  });

  /**
   * Zwraca chronologiczną listę wszystkich zamówień (bonów) z bieżącej aktywnej wizyty stolika
   */
  getActiveOrdersForTable(table: RestaurantTable): Order[] {
    const orders = this.orderService.orders();
    if (table.status === 'free' || table.status === 'dirty') return [];

    const activeIds = new Set(table.activeOrderIds || []);
    if (table.currentOrderId) activeIds.add(table.currentOrderId);

    const matching = orders.filter(o => {
      if (o.status === 'cancelled') return false;
      if (activeIds.has(o.id)) return true;
      if (o.tableNumber.trim().toLowerCase() === table.number.trim().toLowerCase()) {
        if (!table.occupiedSince) return true;
        const visitStart = new Date(table.occupiedSince).getTime() - (2 * 60 * 1000);
        return new Date(o.createdAt).getTime() >= visitStart;
      }
      return false;
    });

    return matching.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  // Strefy w lokalu
  readonly availableZones = computed<string[]>(() => {
    const set = new Set<string>();
    this.tables().forEach(t => {
      if (t.zone?.trim()) set.add(t.zone.trim());
    });
    if (set.size === 0) {
      return ['Sala Główna', 'Ogródek Letni', 'Bar'];
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pl'));
  });

  // Przefiltrowane stoliki wg wybranej strefy
  readonly filteredTables = computed<RestaurantTable[]>(() => {
    const zone = this.selectedZone();
    const all = this.tablesWithLiveStatus();
    if (zone === 'all') return all;
    return all.filter(t => (t.zone || '').toLowerCase() === zone.toLowerCase());
  });

  // --- Live KPI Sali ---
  readonly totalTablesCount = computed(() => this.tablesWithLiveStatus().length);

  readonly freeTablesCount = computed(() =>
    this.tablesWithLiveStatus().filter(t => t.status === 'free').length
  );

  readonly occupiedTablesCount = computed(() =>
    this.tablesWithLiveStatus().filter(t => t.status === 'occupied').length
  );

  readonly billRequestedCount = computed(() =>
    this.tablesWithLiveStatus().filter(t => t.status === 'bill_requested').length
  );

  readonly dirtyTablesCount = computed(() =>
    this.tablesWithLiveStatus().filter(t => t.status === 'dirty').length
  );

  readonly totalSeatsCount = computed(() =>
    this.tablesWithLiveStatus().reduce((sum, t) => sum + (t.seats || 2), 0)
  );

  readonly totalActiveFloorRevenue = computed(() =>
    this.tablesWithLiveStatus().reduce((sum, t) => sum + (t.currentOrderTotal || 0), 0)
  );

  readonly occupancyRate = computed(() => {
    const total = this.totalTablesCount();
    if (total === 0) return 0;
    const occupied = this.occupiedTablesCount() + this.billRequestedCount();
    return Math.round((occupied / total) * 100);
  });

  // Średni czas aktywnej wizyty przy stoliku (w minutach)
  readonly averageOccupiedMinutes = computed(() => {
    const occupiedTables = this.tablesWithLiveStatus().filter(
      t => (t.status === 'occupied' || t.status === 'bill_requested') && t.occupiedSince
    );
    if (occupiedTables.length === 0) return 0;

    const now = Date.now();
    const totalMinutes = occupiedTables.reduce((sum, t) => {
      const start = new Date(t.occupiedSince!).getTime();
      const diffMs = Math.max(0, now - start);
      return sum + Math.round(diffMs / 60000);
    }, 0);

    return Math.round(totalMinutes / occupiedTables.length);
  });

  // Stoliki, których dania są gotowe do odebrania z kuchni (KDS 'ready')
  readonly readyToServeTablesCount = computed(() => {
    const readyOrders = this.orderService.orders().filter(o => o.status === 'ready');
    const tableNumbers = new Set(readyOrders.map(o => o.tableNumber.trim().toLowerCase()));
    return this.tablesWithLiveStatus().filter(t => 
      tableNumbers.has(t.number.trim().toLowerCase()) && (t.status === 'occupied' || t.status === 'bill_requested')
    ).length;
  });

  // Stoliki w trakcie przygotowania przez kuchnię (KDS 'pending' | 'in_progress')
  readonly inProgressKitchenTablesCount = computed(() => {
    const cookingOrders = this.orderService.orders().filter(
      o => o.status === 'pending' || o.status === 'in_progress'
    );
    const tableNumbers = new Set(cookingOrders.map(o => o.tableNumber.trim().toLowerCase()));
    return this.tablesWithLiveStatus().filter(t => 
      tableNumbers.has(t.number.trim().toLowerCase()) && (t.status === 'occupied' || t.status === 'bill_requested')
    ).length;
  });

  constructor() {
    effect(() => {
      const user = this.authService.currentUser();
      if (user) {
        this.initFirestoreSubscription(user.uid);
      } else {
        this.cleanupState();
      }
    });
  }

  private cleanupState(): void {
    if (this.firestoreUnsub) {
      this.firestoreUnsub();
      this.firestoreUnsub = null;
    }
    this.tables.set([]);
    this.isLoading.set(false);
  }

  private initFirestoreSubscription(restaurantId: string): void {
    this.isLoading.set(true);

    try {
      const col = collection(this.firestore, 'tables');
      const q = query(col, where('restaurantId', '==', restaurantId));

      this.firestoreUnsub = onSnapshot(
        q,
        snapshot => {
          const loaded: RestaurantTable[] = snapshot.docs.map(docSnap => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<RestaurantTable, 'id'>)
          }));

          // Sortuj stoliki naturalnie: Stolik 1, Stolik 2...
          loaded.sort((a, b) =>
            a.number.localeCompare(b.number, 'pl', { numeric: true, sensitivity: 'base' })
          );

          this.tables.set(loaded);
          this.isLoading.set(false);

          // Jeśli to nowe konto i nie ma stolików, załaduj starter
          if (loaded.length === 0 && !this.isLoading()) {
            this.resetToStarter(restaurantId, this.authService.isDemoAccount());
          }
        },
        error => {
          console.error('Błąd pobierania stolików z Firestore:', error);
          this.isLoading.set(false);
        }
      );
    } catch (err) {
      console.error('Błąd inicjalizacji subskrypcji stolików:', err);
      this.isLoading.set(false);
    }
  }

  // --- CRUD & Akcje na stolikach ---

  async addTable(dto: Partial<RestaurantTable>): Promise<string> {
    const user = this.authService.currentUser();
    if (!user) throw new Error('Musisz być zalogowany.');

    const now = new Date().toISOString();
    const data: Omit<RestaurantTable, 'id'> = {
      restaurantId: user.uid,
      number: dto.number?.trim() || 'Stolik',
      zone: dto.zone?.trim() || 'Sala Główna',
      seats: Number(dto.seats) || 4,
      status: (dto.status || 'free') as TableStatus,
      notes: dto.notes?.trim() || '',
      createdAt: now,
      updatedAt: now
    };

    try {
      const col = collection(this.firestore, 'tables');
      const docRef = await addDoc(col, this.cleanObject(data));
      this.toastService.success(`Dodano ${data.number} (${data.zone}).`, 'Plan Sali');
      return docRef.id;
    } catch (e) {
      console.error('Błąd dodawania stolika:', e);
      this.toastService.danger('Nie udało się dodać stolika.', 'Błąd');
      throw e;
    }
  }

  async updateTable(id: string, partial: Partial<RestaurantTable>): Promise<void> {
    const docRef = doc(this.firestore, `tables/${id}`);
    try {
      await updateDoc(docRef, this.cleanObject({
        ...partial,
        updatedAt: new Date().toISOString()
      }));
      this.toastService.info('Zaktualizowano dane stolika.', 'Plan Sali');
    } catch (e) {
      console.error('Błąd aktualizacji stolika:', e);
      this.toastService.danger('Błąd zapisu stolika.', 'Błąd');
      throw e;
    }
  }

  async deleteTable(id: string): Promise<void> {
    if (!confirm('Czy na pewno chcesz usunąć ten stolik z planu sali?')) return;
    const docRef = doc(this.firestore, `tables/${id}`);
    try {
      await deleteDoc(docRef);
      this.toastService.warning('Usunięto stolik z sali.', 'Plan Sali');
    } catch (e) {
      console.error('Błąd usuwania stolika:', e);
      this.toastService.danger('Nie udało się usunąć stolika.', 'Błąd');
    }
  }

  async changeStatus(id: string, newStatus: TableStatus): Promise<void> {
    const docRef = doc(this.firestore, `tables/${id}`);
    const now = new Date().toISOString();
    const updateData: Record<string, any> = {
      status: newStatus,
      updatedAt: now
    };
    if (newStatus === 'free') {
      updateData['currentOrderId'] = null;
      updateData['currentOrderNumber'] = null;
      updateData['currentOrderTotal'] = 0;
      updateData['currentOrderItemsCount'] = 0;
      updateData['activeOrderIds'] = [];
      updateData['ordersCount'] = 0;
      updateData['occupiedSince'] = null;
    } else if (newStatus === 'occupied') {
      const current = this.tables().find(t => t.id === id);
      if (!current?.occupiedSince) {
        updateData['occupiedSince'] = now;
      }
    }
    try {
      await updateDoc(docRef, updateData);
    } catch (e) {
      console.error('Błąd zmiany statusu stolika:', e);
    }
  }

  /**
   * Oznaczenie stolika jako zajęty z powiązaniem pierwszego zamówienia wizyty
   */
  async occupyTable(tableId: string, orderData?: { orderId?: string; orderNumber?: number; total?: number; itemsCount?: number }): Promise<void> {
    const docRef = doc(this.firestore, `tables/${tableId}`);
    const now = new Date().toISOString();
    const activeOrderIds = orderData?.orderId ? [orderData.orderId] : [];
    await updateDoc(docRef, this.cleanObject({
      status: 'occupied',
      currentOrderId: orderData?.orderId || null,
      currentOrderNumber: orderData?.orderNumber || null,
      currentOrderTotal: orderData?.total || 0,
      currentOrderItemsCount: orderData?.itemsCount || 0,
      activeOrderIds,
      ordersCount: activeOrderIds.length,
      occupiedSince: now,
      updatedAt: now
    }));
  }

  /**
   * Dołączenie kolejnego zamówienia (bonu/domówienia) do już zajętego stolika
   */
  async appendOrderToTable(tableId: string, orderData: { orderId: string; orderNumber: number; total: number; itemsCount: number }): Promise<void> {
    const current = this.tables().find(t => t.id === tableId);
    if (!current) return;

    const docRef = doc(this.firestore, `tables/${tableId}`);
    const now = new Date().toISOString();
    const existing = current.activeOrderIds || (current.currentOrderId ? [current.currentOrderId] : []);
    const mergedIds = Array.from(new Set([...existing, orderData.orderId]));

    await updateDoc(docRef, this.cleanObject({
      status: 'occupied',
      currentOrderId: orderData.orderId,
      currentOrderNumber: orderData.orderNumber,
      activeOrderIds: mergedIds,
      ordersCount: mergedIds.length,
      occupiedSince: current.occupiedSince || now,
      updatedAt: now
    }));
  }

  /**
   * Oznaczenie stolika po numerze/nazwie jako zajęty lub domówienie kolejnego bonu
   */
  async occupyTableByNumber(tableNumber: string, orderData?: { orderId?: string; orderNumber?: number; total?: number; itemsCount?: number }): Promise<void> {
    const table = this.tables().find(t => t.number.trim().toLowerCase() === tableNumber.trim().toLowerCase());
    if (!table) return;

    if (table.status === 'free') {
      await this.occupyTable(table.id, orderData);
    } else if (orderData?.orderId && orderData?.orderNumber) {
      await this.appendOrderToTable(table.id, {
        orderId: orderData.orderId,
        orderNumber: orderData.orderNumber,
        total: orderData.total || 0,
        itemsCount: orderData.itemsCount || 0
      });
    }
  }

  /**
   * Zgłoszenie prośby o rachunek przez gości
   */
  async requestBill(id: string): Promise<void> {
    await this.changeStatus(id, 'bill_requested');
    this.toastService.info('Zgłoszono prośbę o rachunek.', 'Rachunek');
  }

  /**
   * Oznaczenie stolika jako do przetarcia po wstaniu gości
   */
  async markAsDirty(id: string): Promise<void> {
    await this.changeStatus(id, 'dirty');
  }

  /**
   * Zwolnienie i oznaczenie stolika jako czysty/wolny
   */
  async cleanAndFreeTable(id: string): Promise<void> {
    await this.changeStatus(id, 'free');
    this.toastService.success('Stolik oznaczony jako wolny i przygotowany.', 'Sala');
  }

  /**
   * Rozliczenie całego rachunku stolika (obsługuje jedno lub wiele zamówień/bonów wizyty)
   */
  async settleTableOrder(tableId: string, orderIds?: string[] | string, paymentMethod = 'Karta'): Promise<void> {
    const idsToSettle: string[] = Array.isArray(orderIds) 
      ? orderIds 
      : (orderIds ? [orderIds] : []);

    for (const ordId of idsToSettle) {
      await this.orderService.updateOrderStatus(ordId, 'completed');
    }

    // Po opłaceniu oznaczamy jako do posprzątania i czyścimy bieżący otwarty rachunek wizyty
    const docRef = doc(this.firestore, `tables/${tableId}`);
    await updateDoc(docRef, {
      status: 'dirty',
      currentOrderId: null,
      currentOrderNumber: null,
      currentOrderTotal: 0,
      currentOrderItemsCount: 0,
      activeOrderIds: [],
      ordersCount: 0,
      occupiedSince: null,
      updatedAt: new Date().toISOString()
    });
    this.toastService.success(`Rozliczono rachunek (${paymentMethod}). Stolik czeka na przetarcie.`, 'Rozliczono');
  }

  /**
   * Pobiera sformatowany czas od zajęcia stolika (np. "34 min")
   */
  getElapsedTime(occupiedSince?: string): string {
    if (!occupiedSince) return '';
    return this.orderService.getElapsedTime(occupiedSince);
  }

  /**
   * Przywraca wzorcowy układ sali dla konta Demo (z aktywnymi stolikami) lub nowego lokalu (czyste stoliki)
   */
  async resetToStarter(restaurantId: string, isDemo: boolean = true): Promise<void> {
    const col = collection(this.firestore, 'tables');
    const existingSnap = await getDocs(query(col, where('restaurantId', '==', restaurantId)));

    const batch = writeBatch(this.firestore);
    existingSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const starterTables: Omit<RestaurantTable, 'id'>[] = [
      // Sala Główna
      { 
        restaurantId, 
        number: 'Stolik 1', 
        zone: 'Sala Główna', 
        seats: 4, 
        status: 'free', 
        notes: 'Przy oknie', 
        createdAt: nowIso, 
        updatedAt: nowIso 
      },
      { 
        restaurantId, 
        number: 'Stolik 2', 
        zone: 'Sala Główna', 
        seats: 2, 
        status: isDemo ? 'occupied' : 'free', 
        notes: 'Kącik dla dwojga', 
        occupiedSince: isDemo ? new Date(now - 15 * 60 * 1000).toISOString() : undefined,
        createdAt: nowIso, 
        updatedAt: nowIso 
      },
      { 
        restaurantId, 
        number: 'Stolik 3', 
        zone: 'Sala Główna', 
        seats: 4, 
        status: 'free', 
        notes: 'Środek sali', 
        createdAt: nowIso, 
        updatedAt: nowIso 
      },
      { 
        restaurantId, 
        number: 'Stolik 4', 
        zone: 'Sala Główna', 
        seats: 6, 
        status: isDemo ? 'occupied' : 'free', 
        notes: 'Duży rodzinny', 
        occupiedSince: isDemo ? new Date(now - 5 * 60 * 1000).toISOString() : undefined,
        createdAt: nowIso, 
        updatedAt: nowIso 
      },
      { 
        restaurantId, 
        number: 'Stolik 5', 
        zone: 'Sala Główna', 
        seats: 2, 
        status: isDemo ? 'bill_requested' : 'free', 
        notes: 'Przy witrynie', 
        occupiedSince: isDemo ? new Date(now - 50 * 60 * 1000).toISOString() : undefined,
        createdAt: nowIso, 
        updatedAt: nowIso 
      },
      { 
        restaurantId, 
        number: 'Stolik 6', 
        zone: 'Sala Główna', 
        seats: 4, 
        status: isDemo ? 'dirty' : 'free', 
        notes: isDemo ? 'Do posprzątania po gościach' : 'Obok baru', 
        createdAt: nowIso, 
        updatedAt: nowIso 
      },

      // Ogródek Letni
      { restaurantId, number: 'Ogródek 1', zone: 'Ogródek Letni', seats: 4, status: 'free', notes: 'Pod parasolem', createdAt: nowIso, updatedAt: nowIso },
      { restaurantId, number: 'Ogródek 2', zone: 'Ogródek Letni', seats: 4, status: 'free', notes: 'Z widokiem', createdAt: nowIso, updatedAt: nowIso },
      { restaurantId, number: 'Ogródek 3', zone: 'Ogródek Letni', seats: 2, status: 'free', notes: 'Stolik wysoki', createdAt: nowIso, updatedAt: nowIso },
      { restaurantId, number: 'Ogródek 4', zone: 'Ogródek Letni', seats: 6, status: 'free', notes: 'Lawa ogrodowa', createdAt: nowIso, updatedAt: nowIso },

      // Bar
      { restaurantId, number: 'Bar 1', zone: 'Bar', seats: 2, status: 'free', notes: 'Hokery barowe', createdAt: nowIso, updatedAt: nowIso },
      { restaurantId, number: 'Bar 2', zone: 'Bar', seats: 2, status: 'free', notes: 'Przy ekspresie', createdAt: nowIso, updatedAt: nowIso }
    ];

    const newBatch = writeBatch(this.firestore);
    for (const tbl of starterTables) {
      const newDocRef = doc(col);
      newBatch.set(newDocRef, this.cleanObject(tbl));
    }
    await newBatch.commit();
  }

  private cleanObject(obj: any): any {
    const cleaned: any = {};
    for (const key of Object.keys(obj)) {
      if (obj[key] !== undefined) {
        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
          cleaned[key] = this.cleanObject(obj[key]);
        } else {
          cleaned[key] = obj[key];
        }
      }
    }
    return cleaned;
  }
}
