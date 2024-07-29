// State Management
const StateManager = {
  get: (key) => {
    return new Promise((resolve) => {
      chrome.storage.sync.get(key, (result) => {
        resolve(result[key]);
      });
    });
  },
  set: (key, value) => {
    return new Promise((resolve) => {
      chrome.storage.sync.set({ [key]: value }, resolve);
    });
  }
};

// Enhanced Error Handling
const handleError = (error, context) => {
  console.error(`Error in ${context}:`, error);
  console.error('Error stack:', error.stack);
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'green_square_128px.png',
    title: 'Knob_joiner Error',
    message: `An error occurred while ${context}. Please check the console for details.`
  });
};

// API Request with Retry
const fetchWithRetry = async (url, options, maxRetries = 3, delay = 1000) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.log(`Attempt ${i + 1} failed, retrying in ${delay}ms...`, error);
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }
};

// Time Zone Handling
const convertToLocalTime = (dateTimeString, timeZone) => {
  return new Date(dateTimeString).toLocaleString('en-US', { timeZone: timeZone });
};

// Extension Initialization
chrome.runtime.onInstalled.addListener(() => {
  console.log('Knob_joiner Installed');
  initializeExtension();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('Knob_joiner Startup');
  initializeExtension();
});

const initializeExtension = async () => {
  try {
    await authenticateUser();
    setupAlarm();
    await updateAllAlarms();
    console.log('Extension initialized successfully');
  } catch (error) {
    handleError(error, 'initializing extension');
  }
};

// Message Listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'updateTimeOffset') {
    const offsetDirection = message.timeOffset >= 0 ? 'before' : 'after';
    const offsetMinutes = Math.abs(message.timeOffset);
    console.log(`Time offset updated to: ${message.timeOffset} minutes (${offsetMinutes} minutes ${offsetDirection})`);
    StateManager.set('timeOffset', message.timeOffset).then(() => {
      updateAllAlarms();
    }).catch(error => handleError(error, 'updating time offset'));
  }
});

// Alarm Setup
const setupAlarm = () => {
  chrome.alarms.clear('checkCalendar', () => {
    if (chrome.runtime.lastError) {
      handleError(chrome.runtime.lastError, 'clearing existing alarms');
      return;
    }
    console.log('Previous alarms cleared, setting up new alarms.');
    chrome.alarms.create('checkCalendar', { periodInMinutes: 10 });
    console.log('Alarm set: Meetings will be checked every 10 minutes.');
  });
};

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkCalendar') {
    console.log('Alarm triggered: Checking for meetings now...', new Date().toLocaleString());
    updateAllAlarms().catch(error => handleError(error, 'handling checkCalendar alarm'));
  } else if (alarm.name.startsWith('openTab_')) {
    const link = alarm.name.split('_')[1];
    console.log('Opening scheduled meeting tab:', link);
    openMeetingLink(link);
  }
});

// User Authentication
const authenticateUser = () => {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(`Authentication failed: ${chrome.runtime.lastError.message}`));
      } else if (!token) {
        reject(new Error('No token received'));
      } else {
        console.log('Authentication successful');
        resolve(token);
      }
    });
  });
};

// Update All Alarms
const updateAllAlarms = async () => {
  console.log('Updating all alarms...', new Date().toLocaleString());
  try {
    const token = await authenticateUser();
    await fetchCalendarEvents(token);
  } catch (error) {
    handleError(error, 'updating alarms');
  }
};

// Fetch Calendar Events
const fetchCalendarEvents = async (token) => {
  console.log('Fetching calendar events...', new Date().toLocaleString());
  const calendarApiUrl = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
  const currentTime = new Date().toISOString();
  const twoWeeksFromNow = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const params = new URLSearchParams({
    timeMin: currentTime,
    timeMax: twoWeeksFromNow,
    singleEvents: true,
    orderBy: 'startTime'
  });

  try {
    const data = await fetchWithRetry(`${calendarApiUrl}?${params}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    
    if (!data.items || data.items.length === 0) {
      console.log('No future calendar events found within the next two weeks.');
      return;
    }

    console.log(`Found ${data.items.length} calendar events.`);
    await processCalendarEvents(data.items);
  } catch (error) {
    handleError(error, 'fetching calendar events');
  }
};

// Process Calendar Events
const processCalendarEvents = async (events) => {
  console.log('Processing calendar events...', new Date().toLocaleString());
  const currentTime = new Date();
  let scheduledCount = 0;

  try {
    // Clear all existing alarms except the checkCalendar alarm
    const existingAlarms = await new Promise(resolve => chrome.alarms.getAll(resolve));
    for (const alarm of existingAlarms) {
      if (alarm.name !== 'checkCalendar') {
        await new Promise(resolve => chrome.alarms.clear(alarm.name, resolve));
      }
    }

    const timeOffset = await StateManager.get('timeOffset') || 0;

    for (const event of events) {
      if (event.hangoutLink) {
        console.log('Accepted future event found:', event.summary);
        const startTime = new Date(event.start.dateTime || event.start.date);
        const localStartTime = convertToLocalTime(startTime.toISOString(), event.start.timeZone);
        console.log('Event local start time:', localStartTime);

        const openTime = new Date(startTime.getTime() - timeOffset * 60000);
        if (openTime > currentTime) {
          const alarmName = `openTab_${event.hangoutLink}`;
          await new Promise(resolve => chrome.alarms.create(alarmName, { when: openTime.getTime() }, resolve));
          console.log(`Alarm created for: ${event.summary}, opening at: ${openTime}`);
          scheduledCount++;
        }
      }
    }

    console.log(`Processed ${events.length} events, scheduled ${scheduledCount} for auto-join.`);
  } catch (error) {
    handleError(error, 'processing calendar events');
  }
};

// Open Meeting Link
const openMeetingLink = (link) => {
  console.log('Opening meeting link:', link);
  chrome.windows.getLastFocused({ populate: true }, (window) => {
    if (chrome.runtime.lastError) {
      handleError(chrome.runtime.lastError, 'getting last focused window');
      return;
    }
    if (window) {
      chrome.tabs.create({ url: link, windowId: window.id }, (tab) => {
        if (chrome.runtime.lastError) {
          handleError(chrome.runtime.lastError, 'creating new tab');
        } else {
          console.log('Tab opened with link:', link);
        }
      });
    } else {
      chrome.windows.create({ url: link }, (newWindow) => {
        if (chrome.runtime.lastError) {
          handleError(chrome.runtime.lastError, 'creating new window');
        } else {
          console.log('New window created with link:', link);
        }
      });
    }
  });
};