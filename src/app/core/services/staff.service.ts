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
import { ToastService } from './toast.service';
import { StaffMember, CreateStaffMemberDto, UserRole } from '../models/staff.model';

@Injectable({
  providedIn: 'root'
})
export class StaffService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);

  readonly staff = signal<StaffMember[]>([]);
  readonly isLoading = signal<boolean>(false);
  private firestoreUnsub: Unsubscribe | null = null;

  // Sygnały podsumowujące (KPI)
  readonly totalStaffCount = computed(() => this.staff().length);
  readonly activeStaffCount = computed(() => this.staff().filter(s => s.active).length);
  readonly waitersCount = computed(() => this.staff().filter(s => s.role === 'waiter').length);
  readonly kitchenCount = computed(() => this.staff().filter(s => s.role === 'kitchen').length);
  readonly managersCount = computed(() => this.staff().filter(s => s.role === 'manager' || s.role === 'owner').length);

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
    this.staff.set([]);
    this.isLoading.set(false);
  }

  private initFirestoreSubscription(restaurantId: string): void {
    this.isLoading.set(true);
    if (this.firestoreUnsub) {
      this.firestoreUnsub();
      this.firestoreUnsub = null;
    }

    try {
      const col = collection(this.firestore, 'staff');
      const q = query(col, where('restaurantId', '==', restaurantId));

      this.firestoreUnsub = onSnapshot(
        q,
        snapshot => {
          const loaded: StaffMember[] = snapshot.docs.map(docSnap => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<StaffMember, 'id'>)
          }));

          // Sortuj: aktywni na górze, potem alfabetycznie
          loaded.sort((a, b) => {
            if (a.active !== b.active) return a.active ? -1 : 1;
            return a.name.localeCompare(b.name, 'pl');
          });

          this.staff.set(loaded);
          this.isLoading.set(false);

          // Jeśli to konto Demo i lista jest pusta, załaduj starter pracowników
          if (loaded.length === 0 && this.authService.isDemoAccount()) {
            this.seedStarterStaff(restaurantId);
          }
        },
        error => {
          console.error('Błąd pobierania pracowników z Firestore:', error);
          this.isLoading.set(false);
        }
      );
    } catch (err) {
      console.error('Błąd inicjalizacji subskrypcji pracowników:', err);
      this.isLoading.set(false);
    }
  }

  async addStaffMember(dto: CreateStaffMemberDto): Promise<void> {
    const user = this.authService.currentUser();
    if (!user) throw new Error('Musisz być zalogowany, aby dodać pracownika.');

    const now = new Date().toISOString();
    const newMember: Omit<StaffMember, 'id'> = {
      restaurantId: user.uid,
      name: dto.name.trim(),
      email: dto.email.trim().toLowerCase(),
      role: dto.role,
      phone: dto.phone?.trim() || undefined,
      notes: dto.notes?.trim() || undefined,
      active: true,
      createdAt: now,
      updatedAt: now
    };

    try {
      const col = collection(this.firestore, 'staff');
      await addDoc(col, this.cleanObject(newMember));
      this.toastService.success(`Dodano pracownika: ${dto.name}`, 'Personel');
    } catch (err) {
      console.error('Błąd dodawania pracownika:', err);
      this.toastService.danger('Nie udało się zapisać pracownika.', 'Błąd');
      throw err;
    }
  }

  async updateStaffMember(id: string, changes: Partial<StaffMember>): Promise<void> {
    try {
      const docRef = doc(this.firestore, `staff/${id}`);
      const updateData = {
        ...changes,
        updatedAt: new Date().toISOString()
      };
      await updateDoc(docRef, this.cleanObject(updateData));
      this.toastService.success('Zaktualizowano dane pracownika', 'Sukces');
    } catch (err) {
      console.error('Błąd aktualizacji pracownika:', err);
      this.toastService.danger('Nie udało się zaktualizować pracownika.', 'Błąd');
      throw err;
    }
  }

  async toggleStatus(member: StaffMember): Promise<void> {
    const newStatus = !member.active;
    await this.updateStaffMember(member.id, { active: newStatus });
    this.toastService.info(
      `Status pracownika ${member.name}: ${newStatus ? 'Aktywny' : 'Zablokowany'}`,
      'Status'
    );
  }

  async deleteStaffMember(id: string, name: string): Promise<void> {
    try {
      const docRef = doc(this.firestore, `staff/${id}`);
      await deleteDoc(docRef);
      this.toastService.success(`Usunięto pracownika: ${name}`, 'Personel');
    } catch (err) {
      console.error('Błąd usuwania pracownika:', err);
      this.toastService.danger('Nie udało się usunąć pracownika.', 'Błąd');
      throw err;
    }
  }

  async seedStarterStaff(restaurantId: string): Promise<void> {
    const col = collection(this.firestore, 'staff');
    const existingSnap = await getDocs(query(col, where('restaurantId', '==', restaurantId)));
    const batch = writeBatch(this.firestore);
    existingSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();

    const now = new Date().toISOString();
    const starterStaff: Omit<StaffMember, 'id'>[] = [
      {
        restaurantId,
        name: 'Katarzyna Nowak',
        email: 'kasia.kelnerka@gastroapp.pl',
        role: 'waiter',
        phone: '+48 501 234 567',
        active: true,
        notes: 'Główna zmiana – Sala Główna',
        createdAt: now,
        updatedAt: now
      },
      {
        restaurantId,
        name: 'Marek Wiśniewski',
        email: 'marek.pizzer@gastroapp.pl',
        role: 'kitchen',
        phone: '+48 502 345 678',
        active: true,
        notes: 'Pizzaiolo / Szef Pieca',
        createdAt: now,
        updatedAt: now
      },
      {
        restaurantId,
        name: 'Tomasz Zieliński',
        email: 'tomek.kuchnia@gastroapp.pl',
        role: 'kitchen',
        phone: '+48 503 456 789',
        active: true,
        notes: 'Kucharz sekcji ciepłej i deserów',
        createdAt: now,
        updatedAt: now
      },
      {
        restaurantId,
        name: 'Anna Lewandowska',
        email: 'ania.manager@gastroapp.pl',
        role: 'manager',
        phone: '+48 504 567 890',
        active: true,
        notes: 'Kierownik sali i zaopatrzenia',
        createdAt: now,
        updatedAt: now
      }
    ];

    const newBatch = writeBatch(this.firestore);
    for (const member of starterStaff) {
      const newDocRef = doc(col);
      newBatch.set(newDocRef, this.cleanObject(member));
    }
    await newBatch.commit();
  }

  private cleanObject(obj: any): any {
    const cleaned: any = {};
    for (const key of Object.keys(obj)) {
      if (obj[key] !== undefined) {
        cleaned[key] = obj[key];
      }
    }
    return cleaned;
  }
}
