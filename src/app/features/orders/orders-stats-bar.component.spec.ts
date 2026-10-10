import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OrdersStatsBarComponent } from './orders-stats-bar.component';
import { OrderService } from '../../core/services/order.service';
import { Order } from '../../core/models/order.model';
import { signal } from '@angular/core';

describe('OrdersStatsBarComponent (Live KDS Analytics & KPIs)', () => {
  let component: OrdersStatsBarComponent;
  let fixture: ComponentFixture<OrdersStatsBarComponent>;
  let mockOrdersSignal: ReturnType<typeof signal<Order[]>>;
  let mockTodaysRevenueSignal: ReturnType<typeof signal<number>>;
  let mockCompletedCountSignal: ReturnType<typeof signal<number>>;

  const mockOrders: Order[] = [
    {
      id: 'o-1',
      restaurantId: 'rest-1',
      orderNumber: 101,
      tableNumber: 'Stolik 1',
      status: 'completed',
      stockDeducted: true,
      totalPrice: 105,
      items: [
        { recipeId: 'r1', recipeName: 'Pizza Margherita', category: 'Pizza Rossa (na czerwono)', quantity: 3, unitPrice: 35 }
      ],
      createdAt: '2026-10-10T14:00:00Z',
      updatedAt: '2026-10-10T14:20:00Z'
    },
    {
      id: 'o-2',
      restaurantId: 'rest-1',
      orderNumber: 102,
      tableNumber: 'Stolik 2',
      status: 'completed',
      stockDeducted: true,
      totalPrice: 84,
      items: [
        { recipeId: 'r2', recipeName: 'Pizza Diavola', category: 'Pizza Rossa (na czerwono)', quantity: 2, unitPrice: 42 }
      ],
      createdAt: '2026-10-10T14:15:00Z',
      updatedAt: '2026-10-10T14:35:00Z'
    },
    {
      id: 'o-3',
      restaurantId: 'rest-1',
      orderNumber: 103,
      tableNumber: 'Stolik 3',
      status: 'completed',
      stockDeducted: true,
      totalPrice: 22,
      items: [
        { recipeId: 'r3', recipeName: 'Tiramisu', category: 'Desery', quantity: 1, unitPrice: 22 }
      ],
      createdAt: '2026-10-10T14:30:00Z',
      updatedAt: '2026-10-10T14:50:00Z'
    }
  ];

  beforeEach(async () => {
    mockOrdersSignal = signal<Order[]>(mockOrders);
    mockTodaysRevenueSignal = signal<number>(2400);
    mockCompletedCountSignal = signal<number>(60);

    const mockOrderService = {
      orders: mockOrdersSignal,
      todaysRevenue: mockTodaysRevenueSignal,
      completedOrdersCount: mockCompletedCountSignal,
      currentTime: signal<number>(new Date('2026-10-10T15:00:00Z').getTime())
    };

    await TestBed.configureTestingModule({
      imports: [OrdersStatsBarComponent],
      providers: [
        { provide: OrderService, useValue: mockOrderService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(OrdersStatsBarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('powinien poprawnie zainicjalizować komponent wykresów KDS', () => {
    expect(component).toBeTruthy();
  });

  it('powinien wyliczyć procent realizacji dziennego celu obrotu (revenueTargetPercent)', () => {
    // Utarg = 2400 zł, Cel domyślny = 3000 zł => 80%
    component.dailyRevenueTarget.set(3000);
    expect(component.revenueTargetPercent()).toBe(80);
  });

  it('powinien wyliczyć średnią wartość rachunku (averageOrderValue)', () => {
    // 2400 zł / 60 zamówień = 40.0 zł
    expect(component.averageOrderValue()).toBe(40.0);
  });

  it('powinien ułożyć ranking hitów sprzedaży (topDishesLeaderboard)', () => {
    const leaderboard = component.topDishesLeaderboard();

    expect(leaderboard.length).toBe(3);
    // 1. Margherita: 3 szt, 105 zł obrotu, 100% (baza)
    expect(leaderboard[0].rank).toBe(1);
    expect(leaderboard[0].name).toBe('Pizza Margherita');
    expect(leaderboard[0].count).toBe(3);
    expect(leaderboard[0].revenue).toBe(105);
    expect(leaderboard[0].percentage).toBe(100);

    // 2. Diavola: 2 szt, 84 zł obrotu
    expect(leaderboard[1].rank).toBe(2);
    expect(leaderboard[1].name).toBe('Pizza Diavola');
    expect(leaderboard[1].count).toBe(2);
    expect(leaderboard[1].revenue).toBe(84);

    // 3. Tiramisu: 1 szt, 22 zł obrotu
    expect(leaderboard[2].rank).toBe(3);
    expect(leaderboard[2].name).toBe('Tiramisu');
    expect(leaderboard[2].count).toBe(1);
    expect(leaderboard[2].revenue).toBe(22);
  });

  it('powinien przełączać stan zwinięcia paska (toggleCollapse)', () => {
    expect(component.isCollapsed()).toBeFalse();
    component.toggleCollapse();
    expect(component.isCollapsed()).toBeTrue();
    component.toggleCollapse();
    expect(component.isCollapsed()).toBeFalse();
  });
});
