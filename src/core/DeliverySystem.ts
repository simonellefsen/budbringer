import * as THREE from 'three';
import { Game } from './Game';

export interface Delivery {
  id: number;
  chainId: number;
  stepIndex: number;
  from: string;
  to: string;
  letterContent: string;
  completed: boolean;
}

export interface StoryChain {
  id: number;
  title: string;
  deliveries: Delivery[];
  currentStep: number;
  completed: boolean;
}

export class DeliverySystem {
  private game: Game;
  public storyChains: StoryChain[];
  public currentChainIndex: number = 0;
  public currentDelivery: Delivery | null = null;
  public hasLetter: boolean = false;
  public completedCount: number = 0;
  public totalDeliveries: number = 13;
  public gameComplete: boolean = false;

  constructor(game: Game) {
    this.game = game;
    
    this.storyChains = [
      {
        id: 1,
        title: "The Postmaster's First Assignment",
        deliveries: [
          {
            id: 1, chainId: 1, stepIndex: 0,
            from: 'Postmaster Maple',
            to: 'Fisher Finn',
            letterContent: "Finn - Your fishing license renewal. Don't forget the shrine hours! - Town Hall",
            completed: false
          },
          {
            id: 2, chainId: 1, stepIndex: 1,
            from: 'Fisher Finn',
            to: 'Postmaster Maple',
            letterContent: "Got it! Here's my thank-you note and a promise of fresh catch. - Finn",
            completed: false
          }
        ],
        currentStep: 0,
        completed: false
      },
      {
        id: 2,
        title: "The Hermit's Forgotten Art",
        deliveries: [
          {
            id: 3, chainId: 2, stepIndex: 0,
            from: 'Postmaster Maple',
            to: 'Hermit Hazel',
            letterContent: "Hazel - The town wants to commission a mural. Interested? - Community Board",
            completed: false
          },
          {
            id: 4, chainId: 2, stepIndex: 1,
            from: 'Hermit Hazel',
            to: 'Keeper Kai',
            letterContent: "Kai - I need old star charts from the shrine archives. For the mural. - H",
            completed: false
          },
          {
            id: 5, chainId: 2, stepIndex: 2,
            from: 'Keeper Kai',
            to: 'Hermit Hazel',
            letterContent: "The charts, as requested. May the ancestors guide your brush. - Kai",
            completed: false
          }
        ],
        currentStep: 0,
        completed: false
      },
      {
        id: 3,
        title: "Baker's Secret Recipe",
        deliveries: [
          {
            id: 6, chainId: 3, stepIndex: 0,
            from: 'Postmaster Maple',
            to: 'Baker Brie',
            letterContent: "Brie - Your grandmother's old recipe book arrived! Fragile! - Post Office",
            completed: false
          },
          {
            id: 7, chainId: 3, stepIndex: 1,
            from: 'Baker Brie',
            to: 'Keeper Kai',
            letterContent: "Kai - The solstice bread recipe requires blessed water. May I have some?",
            completed: false
          },
          {
            id: 8, chainId: 3, stepIndex: 2,
            from: 'Keeper Kai',
            to: 'Baker Brie',
            letterContent: "Blessed water enclosed. Bake with gratitude. - Kai",
            completed: false
          }
        ],
        currentStep: 0,
        completed: false
      },
      {
        id: 4,
        title: "Seaside Memories",
        deliveries: [
          {
            id: 9, chainId: 4, stepIndex: 0,
            from: 'Fisher Finn',
            to: 'Hermit Hazel',
            letterContent: "Hazel - Found this old photo of us as kids. Remember the lighthouse? - Finn",
            completed: false
          },
          {
            id: 10, chainId: 4, stepIndex: 1,
            from: 'Hermit Hazel',
            to: 'Fisher Finn',
            letterContent: "You kept it all this time? ...Thank you, old friend. - Hazel",
            completed: false
          }
        ],
        currentStep: 0,
        completed: false
      },
      {
        id: 5,
        title: "The Final Delivery",
        deliveries: [
          {
            id: 11, chainId: 5, stepIndex: 0,
            from: 'Postmaster Maple',
            to: 'Keeper Kai',
            letterContent: "The town thanks you for another year of blessings. - Everyone",
            completed: false
          },
          {
            id: 12, chainId: 5, stepIndex: 1,
            from: 'Keeper Kai',
            to: 'Baker Brie',
            letterContent: "For the festival - a blessing for your bread. Share with all. - Kai",
            completed: false
          },
          {
            id: 13, chainId: 5, stepIndex: 2,
            from: 'Baker Brie',
            to: 'Postmaster Maple',
            letterContent: "A loaf for you, Maple. And tell our courier: they're one of us now.",
            completed: false
          }
        ],
        currentStep: 0,
        completed: false
      }
    ];
  }

  public startFirstDelivery(): void {
    this.setCurrentDelivery(0, 0);
  }

  public captureSave(): { completedIds: number[]; currentId: number | null; hasLetter: boolean } {
    const completedIds: number[] = [];
    for (const chain of this.storyChains) {
      for (const d of chain.deliveries) {
        if (d.completed) completedIds.push(d.id);
      }
    }
    return {
      completedIds,
      currentId: this.currentDelivery?.id ?? null,
      hasLetter: this.hasLetter && !this.gameComplete
    };
  }

  /**
   * Replay a saved mailbag without firing the "all done" dialogue.
   *
   * Delivery ids that no longer exist are ignored, so a rewrite of the
   * quest list cannot leave the courier holding a ghost letter.
   */
  public applySave(saved: {
    completedIds: number[];
    currentId: number | null;
    hasLetter: boolean;
  } | null | undefined): void {
    if (!saved) return;

    const known = new Map<number, Delivery>();
    for (const chain of this.storyChains) {
      for (const d of chain.deliveries) known.set(d.id, d);
    }

    let done = 0;
    for (const id of saved.completedIds) {
      const d = known.get(id);
      if (!d || d.completed) continue;
      d.completed = true;
      done++;
    }
    this.completedCount = done;

    for (const chain of this.storyChains) {
      chain.completed = chain.deliveries.every(d => d.completed);
      const next = chain.deliveries.findIndex(d => !d.completed);
      chain.currentStep = next === -1 ? chain.deliveries.length : next;
    }

    const allDone = this.storyChains.every(c => c.completed);
    if (allDone) {
      this.gameComplete = true;
      this.currentDelivery = null;
      this.hasLetter = false;
      this.currentChainIndex = this.storyChains.length - 1;
      return;
    }

    const wanted = saved.currentId !== null ? known.get(saved.currentId) : undefined;
    const current = wanted && !wanted.completed
      ? wanted
      : this.storyChains.flatMap(c => c.deliveries).find(d => !d.completed);

    if (!current) {
      this.gameComplete = true;
      this.currentDelivery = null;
      this.hasLetter = false;
      return;
    }

    const idx = this.storyChains.findIndex(c => c.id === current.chainId);
    this.currentChainIndex = idx < 0 ? 0 : idx;
    this.currentDelivery = current;
    this.hasLetter = !!saved.hasLetter && wanted === current;
    this.gameComplete = false;
  }

  private setCurrentDelivery(chainIndex: number, stepIndex: number): void {
    if (chainIndex >= this.storyChains.length) {
      this.gameComplete = true;
      this.currentDelivery = null;
      this.hasLetter = false;
      this.game.dialogueSystem.showMessage(
        "All Deliveries Complete!",
        "You've connected everyone on this little planet. The town feels warmer now. Thanks for being our postilion!"
      );
      return;
    }
    
    const chain = this.storyChains[chainIndex];
    
    if (stepIndex >= chain.deliveries.length) {
      chain.completed = true;
      this.setCurrentDelivery(chainIndex + 1, 0);
      return;
    }
    
    this.currentChainIndex = chainIndex;
    chain.currentStep = stepIndex;
    this.currentDelivery = chain.deliveries[stepIndex];
    this.hasLetter = false;
  }

  public canPickupFrom(npcName: string): boolean {
    if (!this.currentDelivery || this.hasLetter || this.gameComplete) return false;
    return this.currentDelivery.from === npcName;
  }

  public canDeliverTo(npcName: string): boolean {
    if (!this.currentDelivery || !this.hasLetter || this.gameComplete) return false;
    return this.currentDelivery.to === npcName;
  }

  public pickupLetter(): string {
    if (!this.currentDelivery) return '';
    this.hasLetter = true;
    this.game.audioManager.playPickup();
    this.game.persistMap();
    return `Take this to ${this.currentDelivery.to}. They're waiting!`;
  }

  public deliverLetter(): string {
    if (!this.currentDelivery) return '';
    
    this.currentDelivery.completed = true;
    this.completedCount++;
    this.game.audioManager.playDeliver();
    
    const response = this.getDeliveryResponse(this.currentDelivery.to);
    
    const chain = this.storyChains[this.currentChainIndex];
    const nextStep = chain.currentStep + 1;
    
    setTimeout(() => {
      this.setCurrentDelivery(this.currentChainIndex, nextStep);
      this.game.persistMap();
    }, 100);
    
    return response;
  }

  private getDeliveryResponse(npcName: string): string {
    const responses: Record<string, string[]> = {
      'Fisher Finn': [
        "My fishing license! Finally. Tell Maple I'll bring fresh catch.",
        "Another letter? You're getting good at this, kid."
      ],
      'Hermit Hazel': [
        "A visitor? How unexpected. The outside world remembers...",
        "The charts! Now I can finish the mural. Thank you.",
        "An old photo... Finn kept this? ...I'll write back."
      ],
      'Keeper Kai': [
        "Blessings upon you, young courier.",
        "The archives? For Hazel's art? Of course.",
        "Blessed water for the baker. The solstice approaches."
      ],
      'Baker Brie': [
        "Gran's recipe book! Careful, it's precious!",
        "Blessed water for the solstice bread. Perfect!",
        "This blessing... the bread will be special this year."
      ],
      'Postmaster Maple': [
        "Good work! Ready for the next delivery?",
        "Excellent! The mail must flow!",
        "You've done it. Every letter, every connection. You're a true postilion."
      ]
    };
    
    const npcResponses = responses[npcName] || ["Thank you for the delivery!"];
    return npcResponses[Math.min(this.completedCount % 3, npcResponses.length - 1)];
  }

  public getCurrentRecipient(): string | null {
    if (!this.currentDelivery || !this.hasLetter) return null;
    return this.currentDelivery.to;
  }

  public getRecipientPosition(): THREE.Vector3 | null {
    const recipientName = this.getCurrentRecipient();
    if (!recipientName) return null;
    
    const npc = this.game.npcManager.getNPCByName(recipientName);
    return npc ? npc.position.clone() : null;
  }

  public getStoryChains(): { id: number; title: string; progress: number; total: number; completed: boolean }[] {
    return this.storyChains.map((chain, chainIndex) => {
      let progress = chain.deliveries.filter(d => d.completed).length;
      
      if (chainIndex === this.currentChainIndex && this.hasLetter && !chain.completed) {
        progress += 0.5;
      }
      
      return {
        id: chain.id,
        title: chain.title,
        progress: Math.floor(progress * 2),
        total: chain.deliveries.length * 2,
        completed: chain.completed
      };
    });
  }

  public update(): void {
  }
}
