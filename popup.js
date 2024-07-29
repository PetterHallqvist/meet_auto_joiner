document.addEventListener('DOMContentLoaded', function () {
  const timeOffsetInput = document.getElementById('time-offset');
  const timeSlider = document.getElementById('time-slider');
  const sliderValue = document.getElementById('slider-value');
  const setTimeButton = document.getElementById('set-time-button');

  const sliderTexts = {
      '5': "early reminder",
      '4': "early reminder",
      '3': "early reminder",
      '2': "sweet spot",
      '1': "sweet spot",
      '0': "sweet spot",
      '-1': "sweet spot",
      '-2': "sweet spot",
      '-3': "late reminder",
      '-4': "late reminder",
      '-5': "late reminder"
  };

  function updateTimeOffset(value) {
    const invertedValue = -value;  // Invert the value
    timeOffsetInput.value = invertedValue;
    timeSlider.value = value;  // Keep the slider value as is
    sliderValue.textContent = sliderTexts[invertedValue];
}


function setTimeOffset() {
  const sliderValue = parseInt(timeSlider.value);
  const invertedValue = -sliderValue;
  if (isNaN(invertedValue) || invertedValue < -5 || invertedValue > 5) {
      alert('Please enter a valid number between -5 and 5.');
      return;
  }
  
  chrome.storage.sync.set({ timeOffset: invertedValue }, function() {
      console.log('Time offset set to:', invertedValue);
      chrome.runtime.sendMessage({ type: 'updateTimeOffset', timeOffset: invertedValue });
      
      showImageAlert(`Great! Your meeting will open ${Math.abs(invertedValue)} minutes ${invertedValue > 0 ? 'before' : invertedValue < 0 ? 'after' : 'at'} the scheduled time.`);
  });
}

  function showImageAlert(message) {
      // Create modal container
      const modal = document.createElement('div');
      modal.style.position = 'fixed';
      modal.style.left = '0';
      modal.style.top = '0';
      modal.style.width = '100%';
      modal.style.height = '100%';
      modal.style.backgroundColor = '#000000'; // Solid black background
      modal.style.display = 'flex';
      modal.style.flexDirection = 'column';
      modal.style.alignItems = 'center';
      modal.style.justifyContent = 'center';
      modal.style.zIndex = '1000';
  
      // Create image element
      const img = document.createElement('img');
      img.src = 'green_square_128px.png'; // Make sure this path is correct
      img.style.width = '128px';
      img.style.height = '128px';
      img.style.marginBottom = '20px';
  
      // Create message element
      const text = document.createElement('p');
      text.textContent = message;
      text.style.color = '#fff';
      text.style.textAlign = 'center';
      text.style.padding = '0 20px';
  
      // Create close button
      const closeButton = document.createElement('button');
      closeButton.textContent = 'Close';
      closeButton.style.marginTop = '20px';
      closeButton.style.padding = '10px 20px';
      closeButton.style.cursor = 'pointer';
      closeButton.style.backgroundColor = '#32CD32'; // Lawngreen color
      closeButton.style.color = '#000000'; // Black text
      closeButton.style.border = 'none';
      closeButton.style.borderRadius = '4px';
  
      closeButton.onclick = function() {
          document.body.removeChild(modal);
      };
  
      // Append elements to modal
      modal.appendChild(img);
      modal.appendChild(text);
      modal.appendChild(closeButton);
  
      // Add modal to body
      document.body.appendChild(modal);
  }

  timeOffsetInput.addEventListener('input', function() {
    let value = parseInt(this.value);
    if (value < -5) value = -5;
    if (value > 5) value = 5;
    updateTimeOffset(value);
});



  timeSlider.addEventListener('input', function() {
      updateTimeOffset(this.value);
  });

  setTimeButton.addEventListener('click', setTimeOffset);

  // Load saved time offset
  chrome.storage.sync.get('timeOffset', function (data) {
      const timeOffset = data.timeOffset || 0;
      updateTimeOffset(-timeOffset);  // Negate the stored value
  });
});