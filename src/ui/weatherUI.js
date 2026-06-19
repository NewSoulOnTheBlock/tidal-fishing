// Weather UI - Visual effects and HUD display

import { S } from "../state/gameState.js";
import { updateWeather, getCurrentWeather, getMoonPhase, getWeatherModifiers } from "../progression/weather.js";
import { getTimeSegment } from "../data/fishData.js";

export class WeatherUI {
  constructor(scene) {
    this.scene = scene; // Three.js scene
    this.widget = null;
    this.rainParticles = null;
    this.fogEffect = null;
  }

  init() {
    // Create HUD widget
    this.widget = document.createElement('div');
    this.widget.id = 'weather-widget';
    this.widget.className = 'weather-widget';
    document.body.appendChild(this.widget);
    
    this.render();
    
    // Update every minute
    setInterval(() => {
      const changed = updateWeather(S.weather);
      if (changed) {
        this.render();
        this.updateVisualEffects();
      }
    }, 60 * 1000);
  }

  render() {
    if (!this.widget || !S.weather) return;
    
    const weather = getCurrentWeather(S.weather);
    const timeSegment = getTimeSegment(S.world.hour);
    const moon = (timeSegment === 'night' || timeSegment === 'dusk') ? getMoonPhase() : null;
    const mods = getWeatherModifiers(S.weather, timeSegment);
    
    this.widget.innerHTML = `
      <div class="weather-display">
        <div class="weather-icon">${weather.icon}</div>
        <div class="weather-info">
          <div class="weather-name">${weather.label}</div>
          <div class="weather-effects">
            ${mods.biteRateMultiplier !== 1.0 ? 
              `<span class="effect ${mods.biteRateMultiplier > 1 ? 'positive' : 'negative'}">
                Bite Rate: ${(mods.biteRateMultiplier * 100).toFixed(0)}%
              </span>` : ''}
            ${mods.rareSpawnBonus > 0 ? 
              `<span class="effect positive">Rare Fish +${(mods.rareSpawnBonus * 100).toFixed(0)}%</span>` : ''}
          </div>
          ${moon ? `
            <div class="moon-phase">
              <span class="moon-icon">${moon.icon}</span>
              <span class="moon-label">${moon.label}</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;
    
    this.updateVisualEffects();
  }

  updateVisualEffects() {
    if (!S.weather) return;
    
    const weather = getCurrentWeather(S.weather);
    
    // Remove existing effects
    this.clearEffects();
    
    // Add weather-specific effects
    switch (weather.id) {
      case 'rain':
        this.createRain(50);
        break;
      case 'storm':
        this.createRain(150);
        this.createLightning();
        break;
      case 'fog':
        this.createFog();
        break;
    }
    
    // Update CSS class on body for atmospheric effects
    document.body.className = document.body.className.replace(/weather-\w+/g, '');
    document.body.classList.add(`weather-${weather.id}`);
  }

  createRain(density) {
    const canvas = document.createElement('canvas');
    canvas.id = 'rain-canvas';
    canvas.className = 'weather-overlay';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    
    const ctx = canvas.getContext('2d');
    const drops = [];
    
    for (let i = 0; i < density; i++) {
      drops.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        speed: 5 + Math.random() * 5,
        length: 10 + Math.random() * 20,
      });
    }
    
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = 'rgba(174, 194, 224, 0.5)';
      ctx.lineWidth = 1;
      
      drops.forEach(drop => {
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x, drop.y + drop.length);
        ctx.stroke();
        
        drop.y += drop.speed;
        if (drop.y > canvas.height) {
          drop.y = -drop.length;
          drop.x = Math.random() * canvas.width;
        }
      });
      
      this.rainAnimationId = requestAnimationFrame(animate);
    };
    
    animate();
  }

  createLightning() {
    // Guard against stacking intervals: clearEffects() runs before each weather
    // change, but double-check so we never run two lightning loops at once.
    if (this.lightningInterval) return;
    this.lightningInterval = setInterval(() => {
      if (Math.random() < 0.05) { // 5% chance per second
        const flash = document.createElement('div');
        flash.className = 'lightning-flash';
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 200);
      }
    }, 1000);
  }

  createFog() {
    const fog = document.createElement('div');
    fog.id = 'fog-overlay';
    fog.className = 'weather-overlay fog';
    document.body.appendChild(fog);
  }

  clearEffects() {
    // Cancel rain animation
    if (this.rainAnimationId) {
      cancelAnimationFrame(this.rainAnimationId);
      this.rainAnimationId = null;
    }

    // Stop the lightning loop (otherwise every storm started a new 1s interval
    // that ran forever, multiplying with each storm).
    if (this.lightningInterval) {
      clearInterval(this.lightningInterval);
      this.lightningInterval = null;
    }
    
    // Remove overlays
    const rainCanvas = document.getElementById('rain-canvas');
    if (rainCanvas) rainCanvas.remove();
    
    const fogOverlay = document.getElementById('fog-overlay');
    if (fogOverlay) fogOverlay.remove();
    
    // Remove lightning flashes
    document.querySelectorAll('.lightning-flash').forEach(el => el.remove());
  }

  destroy() {
    this.clearEffects();
    if (this.widget) {
      this.widget.remove();
      this.widget = null;
    }
    document.body.className = document.body.className.replace(/weather-\w+/g, '');
  }
}
