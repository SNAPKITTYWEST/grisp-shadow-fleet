import { clamp } from './deterministic.js';
import { emitWorldEvent, findRequired, trimHistory } from './state-utils.js';
import type { CommandResult, EntityId, InventoryStack, MarketListingState, UniverseState } from './types.js';

export class EconomySystem {
  constructor(private state: UniverseState) {}

  replaceState(state: UniverseState): void {
    this.state = state;
  }

  trade(marketId: EntityId, commodityId: EntityId, quantity: number, side: 'buy' | 'sell'): CommandResult {
    if (!Number.isInteger(quantity) || quantity <= 0) return this.failure('Trade quantity must be a positive integer.');
    const market = findRequired(this.state.economy.markets, marketId, 'Market');
    if (this.state.player.locationId !== market.locationId) return this.failure(`Player must be present at ${market.name} to trade.`);
    const listing = market.listings.find((item) => item.commodityId === commodityId);
    if (!listing) return this.failure(`Commodity '${commodityId}' is not listed at '${marketId}'.`);
    const commodity = findRequired(this.state.economy.commodities, commodityId, 'Commodity');
    const faction = findRequired(this.state.factions, market.factionId, 'Market faction');
    if (market.sanctions.includes(this.state.player.id) || faction.sanctions.includes(this.state.player.id)) return this.failure('Player is sanctioned by this market.');
    const unitPrice = side === 'buy' ? listing.sellPrice : listing.buyPrice;
    const gross = unitPrice * quantity;
    const tariff = gross * market.tariffRate;
    const total = side === 'buy' ? gross + tariff : gross - tariff;
    if (side === 'buy') {
      if (listing.inventory < quantity) return this.failure(`${market.name} does not have enough ${commodity.name}.`);
      if (this.state.player.credits < total) return this.failure('Insufficient credits.');
      const cargoMass = this.state.player.inventory.reduce((sum, item) => sum + item.massKg * item.quantity, 0);
      if (cargoMass + commodity.unitMassKg * quantity > 200) return this.failure('Personal inventory mass limit exceeded.');
      this.state.player.credits -= total;
      market.credits += total;
      listing.inventory -= quantity;
      this.addPlayerCommodity(commodityId, commodity.name, commodity.unitMassKg, quantity);
    } else {
      const stack = this.state.player.inventory.find((item) => item.itemId === commodityId);
      if (!stack || stack.quantity < quantity) return this.failure(`Player does not possess ${quantity} ${commodity.name}.`);
      if (market.credits < total) return this.failure(`${market.name} cannot fund this purchase.`);
      stack.quantity -= quantity;
      this.state.player.inventory = this.state.player.inventory.filter((item) => item.quantity > 0);
      this.state.player.credits += total;
      market.credits -= total;
      listing.inventory += quantity;
    }
    this.repriceListing(listing, commodity.basePrice, market.tariffRate);
    const event = emitWorldEvent(this.state, 'market-trade', this.state.player.id, market.id, `${side === 'buy' ? 'Bought' : 'Sold'} ${quantity} ${commodity.name} at ${market.name}.`, { data: { commodityId, quantity, side, total } });
    return { ok: true, message: event.summary, eventIds: [event.id] };
  }

  getPrice(marketId: EntityId, commodityId: EntityId): { buy: number; sell: number; shortage: boolean } {
    const market = findRequired(this.state.economy.markets, marketId, 'Market');
    const listing = market.listings.find((candidate) => candidate.commodityId === commodityId);
    if (!listing) throw new Error(`Commodity '${commodityId}' is not listed at '${marketId}'.`);
    return { buy: listing.buyPrice, sell: listing.sellPrice, shortage: listing.shortage };
  }

  tick(deltaMs: number): void {
    const elapsedHours = deltaMs / 3_600_000;
    if (elapsedHours <= 0) return;
    for (const market of this.state.economy.markets) {
      for (const listing of market.listings) {
        listing.inventory = Math.max(0, listing.inventory + (listing.productionPerHour - listing.consumptionPerHour) * elapsedHours);
        const commodity = findRequired(this.state.economy.commodities, listing.commodityId, 'Commodity');
        this.repriceListing(listing, commodity.basePrice, market.tariffRate);
      }
    }
    for (const route of this.state.economy.tradeRoutes) {
      const traffic = this.state.traffic.find((vessel) => vessel.id === route.assignedTrafficId);
      if (traffic?.status === 'distress') continue;
      route.travelProgress += elapsedHours * (0.2 / Math.max(0.05, 1 + route.risk));
      if (route.travelProgress < 1) continue;
      route.travelProgress %= 1;
      const origin = findRequired(this.state.economy.markets, route.originMarketId, 'Origin market');
      const destination = findRequired(this.state.economy.markets, route.destinationMarketId, 'Destination market');
      const originListing = origin.listings.find((listing) => listing.commodityId === route.commodityId);
      const destinationListing = destination.listings.find((listing) => listing.commodityId === route.commodityId);
      const moved = Math.min(route.cargoUnits, originListing?.inventory ?? 0);
      if (originListing) originListing.inventory -= moved;
      if (destinationListing) destinationListing.inventory += moved;
      emitWorldEvent(this.state, 'trade-route-delivery', route.assignedTrafficId, destination.id, `Trade route delivered ${moved} units of ${route.commodityId}.`, { data: { commodityId: route.commodityId, quantity: moved } });
    }
    if (this.state.tick - this.state.economy.lastUpdateTick >= 100) {
      for (const commodity of this.state.economy.commodities) {
        const average = this.state.economy.markets.reduce((sum, market) => sum + (market.listings.find((listing) => listing.commodityId === commodity.id)?.sellPrice ?? commodity.basePrice), 0) / this.state.economy.markets.length;
        const history = this.state.economy.priceHistory[commodity.id] ?? [];
        history.push(Number(average.toFixed(2)));
        trimHistory(history, 120);
        this.state.economy.priceHistory[commodity.id] = history;
      }
      this.state.economy.lastUpdateTick = this.state.tick;
    }
  }

  private repriceListing(listing: MarketListingState, basePrice: number, tariffRate: number): void {
    const ratio = listing.targetInventory / Math.max(1, listing.inventory);
    const scarcityMultiplier = clamp(0.55 + ratio * 0.45, 0.6, 3.5);
    listing.shortage = listing.inventory < listing.targetInventory * 0.5;
    listing.buyPrice = Number((basePrice * scarcityMultiplier * (1 - tariffRate * 0.5)).toFixed(2));
    listing.sellPrice = Number((basePrice * scarcityMultiplier * (1.08 + tariffRate)).toFixed(2));
  }

  private addPlayerCommodity(itemId: EntityId, name: string, massKg: number, quantity: number): void {
    const existing = this.state.player.inventory.find((item) => item.itemId === itemId);
    if (existing) existing.quantity += quantity;
    else {
      const stack: InventoryStack = { itemId, name, quantity, massKg, tags: ['commodity'] };
      this.state.player.inventory.push(stack);
    }
  }

  private failure(message: string): CommandResult {
    return { ok: false, message, eventIds: [] };
  }
}
