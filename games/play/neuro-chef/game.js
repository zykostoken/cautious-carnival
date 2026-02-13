// game.js
export function createGame({ parent, telemetry }) {
  class MainScene extends Phaser.Scene {
    constructor() {
      super({ key: 'MainScene' });
    }

    preload() {
      // No assets externos obligatorios; generamos gráficos procedurales.
    }

    create() {
      // Variables de sesión
      this.telemetry = telemetry;
      this.sessionStart = Date.now();

      // Fondo "mesa"
      const bg = this.add.graphics();
      bg.fillStyle(0x8B4513, 1);
      bg.fillRect(0, 0, 900, 600);

      // Zonas objetivo
      this.dropZones = {};
      this.createDropZone(400, 300, 'plato', 120);
      this.createDropZone(300, 300, 'tenedor', 40, 80);
      this.createDropZone(500, 300, 'cuchillo', 40, 80);
      this.createDropZone(500, 220, 'vaso', 40, 60);

      // Inventario (objetos a arrastrar)
      this.createInteractable(100, 500, 'plato', 60);
      this.createInteractable(220, 500, 'tenedor', 10, 40);
      this.createInteractable(340, 500, 'cuchillo', 10, 40);
      this.createInteractable(460, 500, 'vaso', 20, 30);

      // Instrucción visible (alto contraste)
      this.add.text(450, 40, 'Arrastre el PLATO al centro de la mesa', {
        fontSize: '22px', color: '#ffffff', backgroundColor: '#000000aa', padding: { x: 10, y: 6 }
      }).setOrigin(0.5);

      // Input events
      this.input.on('dragstart', (pointer, gameObject) => {
        gameObject.setAlpha(0.85);
        gameObject.setData('dragPath', [{ x: gameObject.x, y: gameObject.y, t: Date.now() }]);
        this.telemetry.pushEvent({
          time_ms: Date.now(),
          event_type: 'drag_start',
          object_id: gameObject.name,
          start_pos: { x: gameObject.x, y: gameObject.y },
          time_since_session_start: Date.now() - this.sessionStart
        });
      });

      this.input.on('drag', (pointer, gameObject, dragX, dragY) => {
        gameObject.x = dragX;
        gameObject.y = dragY;
        const path = gameObject.getData('dragPath') || [];
        // muestreo cada ~16ms (puede ser más espaciado si se desea)
        path.push({ x: dragX, y: dragY, t: Date.now() });
        gameObject.setData('dragPath', path);
      });

      this.input.on('drop', (pointer, gameObject, dropZone) => {
        if (dropZone && dropZone.name === gameObject.name) {
          gameObject.setData('inDropZone', true);
          gameObject.setData('dropZoneObj', { x: dropZone.x, y: dropZone.y, name: dropZone.name });
        } else {
          gameObject.setData('inDropZone', false);
        }
      });

      this.input.on('dragend', (pointer, gameObject) => {
        gameObject.setAlpha(1);
        const inZone = gameObject.getData('inDropZone');
        if (inZone) {
          const zone = gameObject.getData('dropZoneObj');
          this.tweens.add({ targets: gameObject, x: zone.x, y: zone.y, duration: 200, ease: 'Back.easeOut' });
          this.telemetry.pushEvent({
            time_ms: Date.now(),
            event_type: 'drop_success',
            object_id: gameObject.name,
            target_zone: zone.name,
            pos: { x: gameObject.x, y: gameObject.y }
          });
        } else {
          // animación de retorno
          this.tweens.add({ targets: gameObject, x: gameObject.input.dragStartX, y: gameObject.input.dragStartY, duration: 400, ease: 'Cubic.easeOut' });
          this.telemetry.pushEvent({
            time_ms: Date.now(),
            event_type: 'drop_fail',
            object_id: gameObject.name,
            pos: { x: gameObject.x, y: gameObject.y }
          });
        }
        // análisis de trayectoria
        this.analyzeTrajectory(gameObject);
      });

      // Registrar instrucción mostrada
      this.telemetry.pushEvent({
        time_ms: Date.now(),
        event_type: 'instruction_shown',
        instruction: 'Pon la mesa para la cena',
        time_since_session_start: Date.now() - this.sessionStart
      });
    }

    createDropZone(x, y, name, w = 60, h = 60) {
      const zone = this.add.zone(x, y, w, h).setRectangleDropZone(w, h);
      zone.name = name;
      // silueta sutil
      const g = this.add.graphics();
      g.lineStyle(2, 0xffffff, 0.25);
      if (name === 'plato') g.strokeCircle(x, y, w * 0.5);
      else g.strokeRect(x - w/2, y - h/2, w, h);
      this.dropZones[name] = zone;
      return zone;
    }

    createInteractable(x, y, name, radius = 20, height = null) {
      const container = this.add.container(x, y);
      container.setSize(80, 80);
      container.setInteractive(new Phaser.Geom.Rectangle(-40, -40, 80, 80), Phaser.Geom.Rectangle.Contains);
      container.name = name;

      const shadow = this.add.ellipse(6, 10, radius * 1.6, radius * 0.8, 0x000000, 0.35);
      const shape = this.add.graphics();
      shape.fillStyle(0xffffff, 1);
      if (name === 'plato') shape.fillCircle(0, 0, radius);
      else shape.fillRect(-radius/2, - (height || 30)/2, radius, (height || 30));

      const label = this.add.text(0, radius + 12, name.toUpperCase(), { fontSize: '10px', color: '#000' }).setOrigin(0.5);

      container.add([shadow, shape, label]);
      this.add.existing(container);
      this.input.setDraggable(container);
      return container;
    }

    analyzeTrajectory(gameObject) {
      const path = gameObject.getData('dragPath') || [];
      if (path.length < 2) return;
      let distanceReal = 0;
      for (let i = 1; i < path.length; i++) {
        distanceReal += Phaser.Math.Distance.Between(path[i-1].x, path[i-1].y, path[i].x, path[i].y);
      }
      const start = path[0];
      const end = path[path.length - 1];
      const distanceIdeal = Phaser.Math.Distance.Between(start.x, start.y, end.x, end.y) || 0.001;
      const efficiency = distanceReal / distanceIdeal;
      const pauses = this.detectPauses(path);
      this.telemetry.pushEvent({
        time_ms: Date.now(),
        event_type: 'movement_analysis',
        object_id: gameObject.name,
        efficiency_ratio: Number(efficiency.toFixed(2)),
        pauses_count: pauses,
        sample_points: path.length
      });
    }

    detectPauses(path) {
      let pauses = 0;
      for (let i = 1; i < path.length; i++) {
        const dt = path[i].t - path[i-1].t;
        const dx = Math.abs(path[i].x - path[i-1].x);
        const dy = Math.abs(path[i].y - path[i-1].y);
        if (dt > 300 && dx < 2 && dy < 2) pauses++;
      }
      return pauses;
    }
  }

  const config = {
    type: Phaser.AUTO,
    width: 900,
    height: 600,
    parent,
    scene: [MainScene],
    backgroundColor: '#2d2d2d'
  };

  return new Phaser.Game(config);
}