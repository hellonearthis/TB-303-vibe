// WHAT: Importing the file system module to read and write files.
// WHY: We need to manipulate the sampler.js source file to split out the UI components.
const file_system_module = require('fs');
const samplerJsPath = 'sampler.js';

// WHAT: Reading the original sampler source code from disk.
// WHY: We need the full string content of the file to perform regular expression matching and string extraction.
const original_sampler_source_code = file_system_module.readFileSync(samplerJsPath, 'utf8');

// WHAT: Defining the list of UI-related methods to extract from the KO40Sampler class.
// WHY: These specific methods handle the DOM manipulation and event binding, which should live in a separate UI class.
const methodsToExtract = ['build', 'bind', 'bindMidi', 'syncStepEditor', 'semitoneLabel', 'updateActiveSteps', 'message', 'render'];

let engineCode = original_sampler_source_code;
let uiMethodsCode = [];

// WHAT: Extracting a specific method's source code from the engine code string.
// WHY: We parse the string character by character to correctly match opening and closing braces, avoiding issues with nested blocks that simple regex might miss.
function extractMethod(methodName) {
    const regex = new RegExp('(\\/\\/[^\\n]*\\n)*\\s*' + methodName + '\\s*\\([^\\{]*\\)\\s*\\{');
    const match = regex.exec(engineCode);
    
    // WHAT: Checking if the method exists in the code.
    // WHY: If the regex doesn't match, the method isn't there, so we return null to skip it safely.
    if (!match) return null;
    
    let startIndex = match.index;
    let braceCount = 0;
    let inString = false;
    let stringChar = null;
    let current_character_index = startIndex + match[0].length - 1; // points to '{'
    
    // WHAT: Looping through the source code string to find the matching closing brace for the method.
    // WHY: We need to track string literals (single, double, backtick) so we don't accidentally count braces inside strings.
    for (; current_character_index < engineCode.length; current_character_index++) {
        const current_character_value = engineCode[current_character_index];
        
        // WHAT: Handling escaped characters inside strings.
        // WHY: An escaped quote shouldn't end the string state, so we skip the next character.
        if (current_character_value === '\\' && inString) { current_character_index++; continue; }
        
        // WHAT: Toggling the string state when we encounter an unescaped quote.
        // WHY: We must ignore structural characters like braces if they are just text inside a string literal.
        if ((current_character_value === "'" || current_character_value === '"' || current_character_value === '`') && !inString) { 
            inString = true; 
            stringChar = current_character_value; 
        } else if (current_character_value === stringChar && inString) { 
            inString = false; 
            stringChar = null; 
        }
        
        // WHAT: Counting braces when outside of string literals.
        // WHY: When the brace count drops back to zero, we know we've found the end of the method body.
        if (!inString) {
            if (current_character_value === '{') {
                braceCount++;
            } else if (current_character_value === '}') {
                braceCount--;
                if (braceCount === 0) {
                    const methodBody = engineCode.substring(startIndex, current_character_index + 1);
                    return { start: startIndex, end: current_character_index + 1, body: methodBody };
                }
            }
        }
    }
    return null;
}

// WHAT: Iterating over each method name we want to extract.
// WHY: We need to pull each UI method out of the engine code and replace it with a stub that calls the external UI handler.
methodsToExtract.forEach(method_name_string => {
    const extracted = extractMethod(method_name_string);
    
    // WHAT: Processing successfully extracted methods.
    // WHY: We save the body for the new UI file and replace the original method in the engine with a delegated callback.
    if (extracted) {
        uiMethodsCode.push(extracted.body);
        let replacement = '';
        
        // WHAT: Creating specific replacement stubs for methods that the engine still needs to call.
        // WHY: The engine still dictates when rendering or messages happen, but delegates the actual work to the UI class if it exists.
        if (method_name_string === 'render') replacement = '\n    render() {\n        if (this.onRender) this.onRender();\n    }';
        if (method_name_string === 'message') replacement = '\n    message(parameter_name, step_value) {\n        if (this.onMessage) this.onMessage(parameter_name, step_value);\n    }';
        if (method_name_string === 'updateActiveSteps') replacement = '\n    updateActiveSteps(step_value) {\n        if (this.onUpdateActiveSteps) this.onUpdateActiveSteps(step_value);\n    }';
        
        engineCode = engineCode.substring(0, extracted.start) + replacement + engineCode.substring(extracted.end);
    }
});

// WHAT: Cleaning up the engine class initialization and renaming the class.
// WHY: The UI methods are gone, so we remove their initialization calls and rename the class to clarify its new role as pure engine logic.
engineCode = engineCode.replace(/this\.build\(\);\s*this\.bind\(\);\s*this\.bindMidi\(\);\s*this\.render\(\);/, '/* UI initialization moved to SamplerInstrument */');
engineCode = engineCode.replace(/class KO40Sampler \{/, 'class KO40SamplerEngine {');
engineCode = engineCode.replace(/new KO40Sampler\(\)/, 'new KO40SamplerEngine()');

// WHAT: Writing the modified engine code back to disk.
// WHY: This updates the original file to only contain the core audio/sequencer logic.
file_system_module.writeFileSync('sampler.js', engineCode);

// WHAT: Constructing the boilerplate for the new UI class.
// WHY: We need a new class that extends Instrument and binds to the global SamplerEngine to handle DOM events and rendering.
let uiCode = `class SamplerInstrument extends window.Instrument {
    constructor() {
        super('sampler', document.getElementById('sampler-section'));
        this.engine = window.SamplerEngine;
        this.engine.onRender = () => this.render();
        this.engine.onMessage = (parameter_name, step_value) => this.message(parameter_name, step_value);
        this.engine.onUpdateActiveSteps = (step_value) => this.updateActiveSteps(step_value);
    }

    mount() {
        super.mount();
        this.build();
        this.bind();
        this.bindMidi();
        this.render();
    }

`;

// WHAT: Injecting the extracted UI methods into the new UI class string.
// WHY: We modify the 'this' references so that logic targeting the engine state correctly accesses 'this.engine'.
uiMethodsCode.forEach(method_body_string => {
    let modifiedMethod = method_body_string.replace(/this\./g, 'this.engine.');
    // Fix specific bindings back to local UI context
    modifiedMethod = modifiedMethod.replace(/this\.engine\.(build|bind|bindMidi|syncStepEditor|semitoneLabel|updateActiveSteps|message|render)/g, 'this.$1');
    uiCode += '    ' + modifiedMethod.replace(/\n/g, '\n    ') + '\n\n';
});

// WHAT: Finalizing the UI code string and scheduling its registration.
// WHY: We add a short timeout on DOM load to ensure the engine is fully initialized before the UI tries to attach to it.
uiCode += `}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window.Rack.register(new SamplerInstrument());
    }, 100);
});
`;

// WHAT: Writing the generated UI code to a new file.
// WHY: This separates the UI logic into its own asset, completing the architectural split.
file_system_module.writeFileSync('sampler-ui.js', uiCode);
console.log('Split successful');
