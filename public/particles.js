window.fireConfetti = function() {
  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '9999';
  document.body.appendChild(canvas);
  
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  
  const particles = [];
  const colors = ['#f1c40f', '#e67e22', '#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#gold'];
  
  // Create 150 particles bursting from center bottom
  for(let i=0; i<150; i++) {
    particles.push({
      x: canvas.width / 2,
      y: canvas.height,
      r: Math.random() * 6 + 4,
      dx: Math.random() * 30 - 15,
      dy: Math.random() * -20 - 10,
      color: colors[Math.floor(Math.random() * colors.length)],
      tilt: Math.floor(Math.random() * 10) - 10,
      tiltAngle: 0,
      tiltAngleInc: (Math.random() * 0.07) + 0.05
    });
  }
  
  let animationFrame;
  let angle = 0;
  
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    angle += 0.01;
    let active = false;
    
    for(let i=0; i<particles.length; i++) {
      const p = particles[i];
      p.tiltAngle += p.tiltAngleInc;
      p.y += (Math.cos(angle + p.dx) + 1 + p.r / 2) / 2;
      p.x += Math.sin(angle);
      p.x += p.dx * 0.5;
      p.y += p.dy * 0.5;
      p.dy += 0.3; // gravity
      
      if(p.y < canvas.height + 50) {
        active = true;
        ctx.beginPath();
        ctx.lineWidth = p.r;
        ctx.strokeStyle = p.color;
        ctx.moveTo(p.x + p.tilt + p.r, p.y);
        ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r);
        ctx.stroke();
      }
    }
    
    if (active) {
      animationFrame = requestAnimationFrame(render);
    } else {
      cancelAnimationFrame(animationFrame);
      canvas.remove();
    }
  }
  
  render();
};
