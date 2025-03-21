import { extension_settings, loadExtensionSettings } from "../../../extensions.js";
import { eventSource, event_types, saveSettingsDebounced } from "../../../../script.js";

// Extension name - should match the folder name
const extensionName = "prompt-debugger";

// Default settings
const defaultSettings = {
    enabled: true,
    verboseLogging: false,
    filterOutEmptyFields: true,
    hookAllEvents: true
};

/**
 * Load extension settings
 */
function loadSettings() {
    // Initialize settings with defaults if needed
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
    
    // Update UI to reflect current settings
    $('#prompt_debugger_enabled').prop('checked', extension_settings[extensionName].enabled);
    $('#prompt_debugger_verbose').prop('checked', extension_settings[extensionName].verboseLogging);
    $('#prompt_debugger_filter_empty').prop('checked', extension_settings[extensionName].filterOutEmptyFields);
    $('#prompt_debugger_hook_all').prop('checked', extension_settings[extensionName].hookAllEvents);
}

/**
 * Save settings when they're changed
 */
function saveSettings() {
    saveSettingsDebounced();
}

/**
 * Recursively remove empty fields from an object (arrays with no elements, objects with no properties, etc.)
 * @param {Object} obj - Object to clean
 * @returns {Object} - Cleaned object
 */
function cleanObject(obj) {
    if (!extension_settings[extensionName].filterOutEmptyFields) {
        return obj;
    }
    
    if (obj === null || obj === undefined) {
        return obj;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
        const newArray = obj.filter(item => {
            if (item === null || item === undefined) return false;
            if (typeof item === 'object' && Object.keys(cleanObject(item)).length === 0) return false;
            if (Array.isArray(item) && item.length === 0) return false;
            return true;
        }).map(item => {
            if (typeof item === 'object') {
                return cleanObject(item);
            }
            return item;
        });
        return newArray;
    }

    // Handle objects
    if (typeof obj === 'object') {
        const newObj = {};
        for (const key in obj) {
            if (obj[key] === null || obj[key] === undefined) continue;
            if (typeof obj[key] === 'object') {
                const cleaned = cleanObject(obj[key]);
                if (Object.keys(cleaned).length > 0 || Array.isArray(cleaned) && cleaned.length > 0) {
                    newObj[key] = cleaned;
                }
            } else if (obj[key] !== '') {
                newObj[key] = obj[key];
            }
        }
        return newObj;
    }

    return obj;
}

/**
 * Log the prompt structure to the console
 * @param {Object} promptStruct - The prompt structure to log
 * @param {string} source - Source of the prompt data
 */
function logPromptStruct(promptStruct, source = 'Unknown') {
    try {
        if (!extension_settings[extensionName].enabled) {
            return;
        }

        // Create a deep copy to prevent modifying the original
        const promptStructCopy = JSON.parse(JSON.stringify(promptStruct));
        
        // Clean the object if filtering is enabled
        const cleanedPromptStruct = cleanObject(promptStructCopy);
        
        // Create a group in the console for better visualization
        console.group(`%cPrompt Structure (Source: ${source})`, 'color: #4CAF50; font-weight: bold; font-size: 16px;');
        
        // Log timestamp
        console.log(`%cTimestamp: ${new Date().toISOString()}`, 'color: #999999;');
        
        // Log the main structure
        console.log('Full Prompt Structure:', cleanedPromptStruct);
        
        // If verbose logging is enabled, log individual components
        if (extension_settings[extensionName].verboseLogging) {
            // Log prompt sections separately
            if (cleanedPromptStruct.char_prompt) {
                console.group('%cCharacter Prompt', 'color: #2196F3; font-weight: bold;');
                console.log('Text Components:', cleanedPromptStruct.char_prompt.text);
                console.log('Additional Chat Log:', cleanedPromptStruct.char_prompt.additional_chat_log);
                console.log('Extensions:', cleanedPromptStruct.char_prompt.extension);
                console.groupEnd();
            }
            
            if (cleanedPromptStruct.user_prompt) {
                console.group('%cUser Prompt', 'color: #FF9800; font-weight: bold;');
                console.log('Text Components:', cleanedPromptStruct.user_prompt.text);
                console.log('Additional Chat Log:', cleanedPromptStruct.user_prompt.additional_chat_log);
                console.log('Extensions:', cleanedPromptStruct.user_prompt.extension);
                console.groupEnd();
            }
            
            if (cleanedPromptStruct.world_prompt) {
                console.group('%cWorld Prompt', 'color: #9C27B0; font-weight: bold;');
                console.log('Text Components:', cleanedPromptStruct.world_prompt.text);
                console.log('Additional Chat Log:', cleanedPromptStruct.world_prompt.additional_chat_log);
                console.log('Extensions:', cleanedPromptStruct.world_prompt.extension);
                console.groupEnd();
            }
            
            if (Object.keys(cleanedPromptStruct.other_chars_prompt || {}).length > 0) {
                console.group('%cOther Characters Prompts', 'color: #E91E63; font-weight: bold;');
                for (const charId in cleanedPromptStruct.other_chars_prompt) {
                    console.group(`Character ID: ${charId}`);
                    console.log('Text Components:', cleanedPromptStruct.other_chars_prompt[charId].text);
                    console.log('Additional Chat Log:', cleanedPromptStruct.other_chars_prompt[charId].additional_chat_log);
                    console.log('Extensions:', cleanedPromptStruct.other_chars_prompt[charId].extension);
                    console.groupEnd();
                }
                console.groupEnd();
            }
            
            if (Object.keys(cleanedPromptStruct.plugin_prompts || {}).length > 0) {
                console.group('%cPlugin Prompts', 'color: #00BCD4; font-weight: bold;');
                for (const pluginId in cleanedPromptStruct.plugin_prompts) {
                    console.group(`Plugin ID: ${pluginId}`);
                    console.log('Text Components:', cleanedPromptStruct.plugin_prompts[pluginId].text);
                    console.log('Additional Chat Log:', cleanedPromptStruct.plugin_prompts[pluginId].additional_chat_log);
                    console.log('Extensions:', cleanedPromptStruct.plugin_prompts[pluginId].extension);
                    console.groupEnd();
                }
                console.groupEnd();
            }
            
            if (cleanedPromptStruct.chat_log) {
                console.group('%cChat Log', 'color: #795548; font-weight: bold;');
                console.log('Entries:', cleanedPromptStruct.chat_log);
                console.groupEnd();
            }
        }
        
        console.groupEnd();
        
    } catch (error) {
        console.error('Error in Prompt Debugger plugin:', error);
    }
}

// Store original functions to hook into
let originalBuildPromptStruct = null;
let originalPromptBuilder = null;

/**
 * Setup event listeners and hook into SillyTavern functions
 */
function setupEventListeners() {
    try {
        console.log('Prompt Debugger: Setting up event listeners and hooks...');
        
        // Method 1: Listen for chat completion prompt ready event
        eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, (payload) => {
            if (!extension_settings[extensionName].enabled) {
                return;
            }
            
            try {
                console.log('Prompt Debugger: CHAT_COMPLETION_PROMPT_READY event triggered', payload);
                
                if (payload && payload.prompt_struct) {
                    console.log('Prompt Debugger: Captured prompt from CHAT_COMPLETION_PROMPT_READY event');
                    logPromptStruct(payload.prompt_struct, 'CHAT_COMPLETION_PROMPT_READY');
                } else {
                    console.warn('Prompt Debugger: No prompt structure available in CHAT_COMPLETION_PROMPT_READY payload');
                }
            } catch (err) {
                console.error('Prompt Debugger: Error processing CHAT_COMPLETION_PROMPT_READY event', err);
            }
        });

        // Method 2: Hook into system.js generateSystemPrompt or similar
        if (window.SillyTavern) {
            console.log('Prompt Debugger: Found SillyTavern global object');
            
            // Attempt to hook into various ST objects that might contain prompt data
            if (window.SillyTavern.getContext) {
                const originalGetContext = window.SillyTavern.getContext;
                window.SillyTavern.getContext = function() {
                    const context = originalGetContext.apply(this, arguments);
                    
                    if (extension_settings[extensionName].enabled && extension_settings[extensionName].hookAllEvents) {
                        console.log('Prompt Debugger: Context captured from getContext()');
                        console.log('Context:', context);
                    }
                    
                    return context;
                };
                console.log('Prompt Debugger: Hooked into SillyTavern.getContext');
            }
        }
        
        // Method 3: Hook into global Generate function if available
        if (window.Generate) {
            const originalGenerate = window.Generate;
            window.Generate = async function() {
                if (extension_settings[extensionName].enabled && extension_settings[extensionName].hookAllEvents) {
                    console.log('Prompt Debugger: Generate function called with args:', arguments);
                }
                return originalGenerate.apply(this, arguments);
            };
            console.log('Prompt Debugger: Hooked into global Generate function');
        }

        // Method 4: Create a plugin API interface to access the prompt directly
        window.promptDebuggerPlugin = {
            interfaces: {
                chat: {
                    GetPrompt: async function(arg, prompt_struct, detail_level) {
                        if (extension_settings[extensionName].enabled) {
                            console.log('Prompt Debugger: GetPrompt called via plugin API');
                            console.log('arg:', arg);
                            console.log('prompt_struct:', prompt_struct);
                            logPromptStruct(prompt_struct, 'Plugin API GetPrompt');
                        }
                        
                        // Return an empty prompt structure - this is just for debugging
                        return {
                            text: [],
                            additional_chat_log: [],
                            extension: {}
                        };
                    },
                    ReplyHandler: async function(reply, args) {
                        if (extension_settings[extensionName].enabled && extension_settings[extensionName].hookAllEvents) {
                            console.log('Prompt Debugger: ReplyHandler called');
                            console.log('reply:', reply);
                            console.log('args:', args);
                            
                            if (args && args.prompt_struct) {
                                logPromptStruct(args.prompt_struct, 'Plugin API ReplyHandler');
                            }
                        }
                        return false; // Don't intercept the reply process
                    }
                }
            }
        };

        // Method 5: Try to hook into the buildPromptStruct function
        if (typeof window.buildPromptStruct === 'function') {
            originalBuildPromptStruct = window.buildPromptStruct;
            window.buildPromptStruct = async function() {
                const result = await originalBuildPromptStruct.apply(this, arguments);
                
                if (extension_settings[extensionName].enabled) {
                    console.log('Prompt Debugger: Captured prompt from buildPromptStruct');
                    logPromptStruct(result, 'buildPromptStruct');
                }
                
                return result;
            };
            console.log('Prompt Debugger: Hooked into buildPromptStruct function');
        }

        // Method 6: Hook into promptBuilder if possible
        if (typeof window.promptBuilder === 'function') {
            originalPromptBuilder = window.promptBuilder;
            window.promptBuilder = function() {
                const result = originalPromptBuilder.apply(this, arguments);
                
                if (extension_settings[extensionName].enabled) {
                    console.log('Prompt Debugger: Captured prompt from promptBuilder');
                    console.log('promptBuilder arguments:', arguments);
                    console.log('promptBuilder result:', result);
                }
                
                return result;
            };
            console.log('Prompt Debugger: Hooked into promptBuilder function');
        }

        console.log('Prompt Debugger: Hooks and event listeners registered successfully');
    } catch (error) {
        console.error('Prompt Debugger: Failed to setup event listeners and hooks', error);
    }
}

/**
 * Add custom debug commands to the console
 */
function addConsoleDebugCommands() {
    window.promptDebugger = {
        dumpContext: function() {
            if (typeof window.getContext === 'function') {
                const context = window.getContext();
                console.log('Current SillyTavern Context:', context);
                return context;
            } else {
                console.error('getContext function not found');
                return null;
            }
        },
        
        toggleEnabled: function() {
            extension_settings[extensionName].enabled = !extension_settings[extensionName].enabled;
            $('#prompt_debugger_enabled').prop('checked', extension_settings[extensionName].enabled);
            saveSettings();
            console.log(`Prompt Debugger: ${extension_settings[extensionName].enabled ? 'enabled' : 'disabled'}`);
        },
        
        toggleVerbose: function() {
            extension_settings[extensionName].verboseLogging = !extension_settings[extensionName].verboseLogging;
            $('#prompt_debugger_verbose').prop('checked', extension_settings[extensionName].verboseLogging);
            saveSettings();
            console.log(`Prompt Debugger: Verbose logging ${extension_settings[extensionName].verboseLogging ? 'enabled' : 'disabled'}`);
        },
        
        help: function() {
            console.log(`
Prompt Debugger Console Commands:
- promptDebugger.dumpContext() - Dump the current SillyTavern context
- promptDebugger.toggleEnabled() - Toggle prompt debugging on/off
- promptDebugger.toggleVerbose() - Toggle verbose logging on/off
- promptDebugger.help() - Show this help message
            `);
        }
    };
    
    console.log('Prompt Debugger: Console debug commands registered. Type promptDebugger.help() for available commands.');
}

/**
 * Handle extension setting changes
 */
function onEnabledChanged() {
    extension_settings[extensionName].enabled = $('#prompt_debugger_enabled').prop('checked');
    saveSettings();
    
    const status = extension_settings[extensionName].enabled ? 'enabled' : 'disabled';
    console.log(`Prompt Debugger: ${status}`);
}

function onVerboseLoggingChanged() {
    extension_settings[extensionName].verboseLogging = $('#prompt_debugger_verbose').prop('checked');
    saveSettings();
    
    const status = extension_settings[extensionName].verboseLogging ? 'enabled' : 'disabled';
    console.log(`Prompt Debugger: Verbose logging ${status}`);
}

function onFilterEmptyChanged() {
    extension_settings[extensionName].filterOutEmptyFields = $('#prompt_debugger_filter_empty').prop('checked');
    saveSettings();
    
    const status = extension_settings[extensionName].filterOutEmptyFields ? 'enabled' : 'disabled';
    console.log(`Prompt Debugger: Filtering empty fields ${status}`);
}

function onHookAllChanged() {
    extension_settings[extensionName].hookAllEvents = $('#prompt_debugger_hook_all').prop('checked');
    saveSettings();
    
    const status = extension_settings[extensionName].hookAllEvents ? 'enabled' : 'disabled';
    console.log(`Prompt Debugger: Hooking all events ${status}`);
}

/**
 * Initialize the extension
 */
jQuery(async () => {
    try {
        console.log('Initializing Prompt Debugger plugin...');
        
        // Create the settings UI
        const settingsHtml = `
            <div id="prompt_debugger_settings" class="extension_settings">
                <div class="inline-drawer">
                    <div class="inline-drawer-toggle inline-drawer-header">
                        <b>Prompt Debugger</b>
                        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                    </div>
                    <div class="inline-drawer-content">
                        <div class="prompt_debugger_block">
                            <label class="checkbox_label">
                                <input type="checkbox" id="prompt_debugger_enabled" />
                                <span>Enable Prompt Debugging</span>
                            </label>
                            <label class="checkbox_label">
                                <input type="checkbox" id="prompt_debugger_verbose" />
                                <span>Verbose Logging</span>
                            </label>
                            <label class="checkbox_label">
                                <input type="checkbox" id="prompt_debugger_filter_empty" />
                                <span>Filter Out Empty Fields</span>
                            </label>
                            <label class="checkbox_label">
                                <input type="checkbox" id="prompt_debugger_hook_all" />
                                <span>Hook All Events (May Be Noisy)</span>
                            </label>
                            <div class="prompt_debugger_info">
                                <p><i class="fa-solid fa-info-circle"></i> When enabled, this plugin captures and logs the full prompt structure to the browser console.</p>
                                <p>To view logs:</p>
                                <ol>
                                    <li>Open your browser's Developer Tools (F12 or Ctrl+Shift+I)</li>
                                    <li>Go to the "Console" tab</li>
                                    <li>Generate a message to see the prompt structure</li>
                                </ol>
                                <p>Console commands:</p>
                                <ul>
                                    <li><code>promptDebugger.dumpContext()</code> - Dump current context</li>
                                    <li><code>promptDebugger.toggleEnabled()</code> - Toggle debugging</li>
                                    <li><code>promptDebugger.help()</code> - Show all commands</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Add the settings HTML to the extensions settings panel
        $('#extensions_settings').append(settingsHtml);
        
        // Setup event handlers for the settings controls
        $('#prompt_debugger_enabled').on('change', onEnabledChanged);
        $('#prompt_debugger_verbose').on('change', onVerboseLoggingChanged);
        $('#prompt_debugger_filter_empty').on('change', onFilterEmptyChanged);
        $('#prompt_debugger_hook_all').on('change', onHookAllChanged);
        
        // Load saved settings
        loadSettings();
        
        // Setup event listeners and hooks
        setupEventListeners();
        
        // Add console debug commands
        addConsoleDebugCommands();
        
        console.log('Prompt Debugger plugin initialized successfully');
        
        // Attempt to get any global modules that might contain prompt data
        console.log('Looking for global SillyTavern modules...');
        
        // When running in browser extensions can access window's objects
        window.setTimeout(() => {
            if (extension_settings[extensionName].enabled) {
                console.log('Prompt Debugger: Scanning for available SillyTavern modules and objects...');
                
                // Log potentially useful global objects for debugging
                if (window.SillyTavern) console.log('Found SillyTavern global object');
                if (window.getContext) console.log('Found getContext function');
                if (window.Generate) console.log('Found Generate function');
                if (window.buildPromptStruct) console.log('Found buildPromptStruct function');
                if (window.promptBuilder) console.log('Found promptBuilder function');
                if (window.eventSource) console.log('Found eventSource object');
                if (window.event_types) console.log('Found event_types object');
            }
        }, 2000);
        
    } catch (error) {
        console.error('Failed to initialize Prompt Debugger plugin:', error);
    }
});
