/*************************************************************************************************************/
/***** Class: SimpleDialog - plain dialog window with some fields                              ***************/
/*************************************************************************************************************/

function SimpleDialog (D, formId, title, fieldDefs, applyFunction, closeFunction, showButtons) {
	var realThis = this;	// for use in enclosures

	this.D = D;			// UniDB instance
	this.jqDialog = D.dialogWindow;
	this.formId = formId;
	this.title = title;
	this.applyFunction = applyFunction;
	this.closeFunction = closeFunction;
	this.showButtons = ( showButtons == undefined ? B_ALL : showButtons );

	// generate Field records
	this.Fields = {};
	for (var col in fieldDefs) {
		this.Fields[col] = new Field(D, col, fieldDefs[col]);
	}

	this.show();
}

SimpleDialog.prototype.show = function () {
	var realThis = this;	// for use in enclosures

	// empty window and set title
	this.jqDialog.text("");
	this.jqDialog.dialog("option", "title", this.title);

	var editForm = $("<form/>", { id: this.formId });

	// now we iterate over the Fields 
	for (var col in this.Fields) {
		this.Fields[col].showLabel(editForm);
		this.Fields[col].showField(editForm);
	}
	editForm.appendTo(this.jqDialog);

	// make buttons
	var buttons = {};
	if (this.showButtons & B_OK) {
		buttons["OK"] = function() {
					realThis.disable();
					realThis.applyFunction(realThis, function() {
						realThis.jqDialog.dialog("close");
					});
				};
	}
	if (this.showButtons & B_APPLY) {
		buttons["Apply"] = function() {
					realThis.disable();
					realThis.applyFunction(realThis, function() {
						realThis.enable();
					});
				};
	}
	if (this.showButtons & B_CANCEL) {
		buttons["Cancel"]= function() {
					realThis.jqDialog.dialog("close");
				};
	}
	if (this.showButtons & B_CLOSE) {
		buttons["Close"]= function() {
					realThis.jqDialog.dialog("close");
				};
	}
	this.jqDialog.dialog("option", "buttons", buttons);

	// link close function to close button
	this.jqDialog.off("dialogclose");
	if (typeof realThis.closeFunction == 'function') {
		this.jqDialog.on("dialogclose", function() {
			realThis.closeFunction(realThis);
		});
	}
	// finall, open the dialog window
	this.jqDialog.dialog("open");
}

// disable(): 
SimpleDialog.prototype.disable = function () {
	this.jqDialog.find("input,select").prop("disabled","disabled");
}

// enable(): 
SimpleDialog.prototype.enable = function () {
	this.jqDialog.find("input,select").removeProp("disabled");
}

