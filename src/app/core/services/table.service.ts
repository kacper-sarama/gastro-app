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
import { Order } from '../models/order.model';

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
  readonly tablesWithLiveStatus = computed<RestaurantTable[]>(() => {
    const rawTables = this.tables();
    const activeOrders = this.orderService.orders().filter(
      o => o.status !== 'completed' && o.status !== 'cancelled'
    );

    return rawTables.map(tbl => {
      // Szukaj aktywnego zamówienia pasującego do nazwy/numeru stolika
      const matchingOrder = activeOrders.find(
        o => o.tableNumber.trim().toLowerCase() === tbl.number.trim().toLowerCase()
      );

      if (matchingOrder) {
        // Jeśli jest aktywne zamówienie, stolik jest zajęty
        const status: TableStatus = tbl.status === 'bill_requested' ? 'bill_requested' : 'occupied';
        return {
          ...tbl,
          status,
          currentOrderId: matchingOrder.id,
          currentOrderNumber: matchingOrder.orderNumber,
          currentOrderTotal: matchingOrder.totalPrice,
          currentOrderItemsCount: matchingOrder.items.reduce((s, i) => s + i.quantity, 0),
          occupiedSince: matchingOrder.createdAt
        };
      }

      // Jeśli nie ma aktywnego zamówienia, a w bazie wisiało 'occupied', traktujemy jako 'free'
      if (tbl.status === 'occupied') {
        return {
          ...tbl,
          status: 'free',
          currentOrderId: undefined,
          currentOrderNumber: undefined,
          currentOrderTotal: undefined,
          currentOrderItemsCount: undefined,
          occupiedSince: undefined
        };
      }

      return tbl;
    });
  });

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
            this.resetToStarter(restaurantId);
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
    try {
      await updateDoc(docRef, {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
    } catch (e) {
      console.error('Błąd zmiany statusu stolika:', e);
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
   * Rozliczenie rachunku stolika (płatność kartą / gotówką / BLIK)
   */
  async settleTableOrder(tableId: string, orderId?: string, paymentMethod = 'Karta'): Promise<void> {
    if (orderId) {
      await this.orderService.updateOrderStatus(orderId, 'completed');
    }
    // Po opłaceniu oznaczamy jako do posprzątania / wolny
    await this.changeStatus(tableId, 'dirty');
    this.toastService.success(`Rozliczono zamówienie (${paymentMethod}). Stolik czeka na przetarcie.`, 'Rozliczono');
  }

  /**
   * Pobiera sformatowany czas od zajęcia stolika (np. "34 min")
   */
  getElapsedTime(occupiedSince?: string): string {
    if (!occupiedSince) return '';
    return this.orderService.getElapsedTime(occupiedSince);
  }

  /**
   * Przywraca wzorcowy układ sali dla konta Demo lub nowego lokalu
   */
  async resetToStarter(restaurantId: string): Promise<void> {
    const col = collection(this.firestore, 'tables');
    const existingSnap = await getDocs(query(col, where('restaurantId', '==', restaurantId)));

    const batch = writeBatch(this.firestore);
    existingSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();

    const now = new Date().toISOString();
    const starterTables: Omit<RestaurantTable, 'id'>[] = [
      // Sala Główna
      { restaurantId, number: 'Stolik 1', zone: 'Sala Główna', seats: 4, status: 'free', notes: 'Przy oknie', createdAt: now, updatedAt: now },
      { restaurantId, number: 'Stolik 2', zone: 'Sala Główna', seats: 2, status: 'free', notes: 'Kącik dla dwojga', createdAt: now, updatedAt: now },
      { restaurantId, number: 'Stolik 3', zone: 'Sala Główna', seats: 4, status: 'free', notes: 'Środek sali', createdAt: now, updatedAt: now },
      { restaurantId, number: 'Stolik 4', zone: 'Sala Główna', seats: 6, status: 'free', notes: 'Duży rodzinny', createdAt: now, updatedAt: now },
      { restaurantId, number: 'Stolik 5', zone: 'Sala Główna', seats: 2, status: 'free', notes: 'Przy witrynie', createdAt: now, updatedAt: now },
      { restaurantId, number: 'Stolik 6', zone: 'Sala Główna', seats: 4, status: 'free', notes: 'Obok baru', createdAt: now, updatedAt: now },

      // Ogródek Letni
      { restaurantId, number: 'Ogródek 1', zone: 'Ogródek Letni', seats: 4, status: 'free', notes: 'Pod parasolem', createdAt: now, updatedAt: now },
      { restaurantId, number: 'Ogródek 2', zone: 'Ogródek Letni', seats: 4, status: 'free', notes: 'Z widokiem', createdAt: now, updatedAt: now },
      { restaurantId, number: 'Ogródek 3', zone: 'Ogródek Letni', seats: 2, status: 'free', notes: 'Stolik wysoki', createdAt: now, updatedAt: now },
      { restaurantId, number: 'Ogródek 4', zone: 'Ogródek Letni', seats: 6, status: 'free', notes: 'Lawa ogrodowa', createdAt: now, updatedAt: now },

      // Bar
      { restaurantId, number: 'Bar 1', zone: 'Bar', seats: 2, status: 'free', notes: 'Hokery barowe', createdAt: now, updatedAt: now },
      { restaurantId, number: 'Bar 2', zone: 'Bar', seats: 2, status: 'free', notes: 'Przy ekspresie', createdAt: now, updatedAt: now }
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
