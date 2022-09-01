/*************************************************************************************************************/
/***** Class: Field - a form field, used by Record                                             ***************/
/*************************************************************************************************************/

function Field (DR, name, definition, value) {
	// first parameter can be parent Record or UniDB instance
	// this.R will be the parent Record (or null if none)
	// this.D will be the UniDB instance
	if (DR.hasOwnProperty("dbiUrl")) {	// first parameter: UniDB instance
		this.R = null;
		this.D = DR;
	} else {
		this.R = DR;
		this.D = this.R.T.D;
	}
	this.name = name;			// MySQL name
    this.isPriKey = this.R && (this.name == this.R.T.priKey)
	// set objects's properties:
	this.label = definition.label;	                                                    	// label/description
	this.type = ( definition.read_only || this.isPriKey ? 'readonly' : definition.type );	// type
	this.size = ( definition.max_length < 70 ? definition.max_length : 70 );	        	// length (size of input field)
    this.max_length = definition.max_length                                                 // max content length
    this.required = definition.required;                                                    // required field?
	this.placeholder = definition.help_text || '';                                          // help text if available
	this.options = definition.choices || [];
    this.field_error = null;
    this.foreign_table = definition.foreign_table;
	this.foreign_key = definition.foreign_key;
    this.min_value = definition.min_value;
    this.max_value = definition.max_value;
    this.max_digits = definition.max_digits;
    this.decimal_places = definition.decimal_places;
    if (value === undefined) {
        this.set(definition.value);
    } else {
        this.set(value);
    }
}

/* set() : set value */
Field.prototype.set = function(value) {
	this.oldValue = value;

	if (this.isRecordName && this.R) {
		this.R.name = value;	// isName flag means that this field is the name of the Record
	}
}

/* value() : return current value of the field */
Field.prototype.value = function() {
	if (this.type == "boolean") {
		// for a checkbox, we cannot access the value directly, but have to look at the checked property
		return(this.input.prop("checked") ? 1 : 0);
	} else if ( (this.type == "raw") || (this.type == "hidden") ) {
		// raw and hidden elements have no value
		return(null);
	} else {
		// other inputs are trivial (but we return null instead of an empty string
		return(( (this.input.val() == "") || (this.input.val() == "NULL") ) ? null : this.input.val());
	}
}

// render() : display the field
Field.prototype.render = function(target) {
	var realThis = this;			// used in anonymous function

    // if type is hidden: just return
    if (this.type == 'hidden') {
        return(true);
    }

	// if type is raw: just return
	if (this.type == 'raw') {
		this.oldValue.appendTo(target);
		return(true);
	}

	if (this.label) {
		$("<label/>", {	"for":	( this.R ? this.R.T.tableName : "" ) + "-" + this.name ,
				id:	( this.R ? this.R.T.tableName : "" ) + "-" + this.name + "-label",
				text:	this.label } )
			.appendTo(target);
	}

	// other types: wrapped in outer <div/>
	this.outerDiv = $("<div/>", { id: ( this.R ? this.R.T.tableName : "" ) + "-" + this.name + "-outer" } );

	// the main work is to display according to column type
	switch (this.type) {
		case 'readonly':
			var display_name = this.oldValue;
			for (var i = 0; i < this.options.length; i++) {
				if (this.oldValue == this.options[i]['value'] == this.oldValue) {
					display_name = this.options[i]['display_name'];
				}
			}
			this.input = $("<span/>", {
							class:  'readonly-field',
							id:	 ( this.R ? this.R.T.tableName : "" )+"-"+this.name,
							text:   display_name });
			break;
		case 'pre':
			if ( this.oldValue == null ) {
				this.input = $("<span/>", { text: "NULL", "class": "sql-null" });
			} else {
				this.input = $("<pre/>", {	id:		( this.R ? this.R.T.tableName : "" )+"-"+this.name,
								text:	this.oldValue });
			}
			break;
		case 'boolean':
			this.input = $("<input>", {	type:		"checkbox",
							name:		this.name,
							id:		( this.R ? this.R.T.tableName : "" )+"-"+this.name,
							value: 		1 });
			if (this.oldValue == 1) {
				this.input.prop("checked","checked");
			}
			break;
		case 'string':
			this.input = $("<input>", {	type:		"text",
							name:		this.name, 
							id:		( this.R ? this.R.T.tableName : "" )+"-"+this.name,
							value:		this.oldValue,
							placeholder:	this.placeholder })
				.prop("size", this.size);
			break;
		case 'integer':
            this.size = Math.floor(Math.log10(Math.max(Math.abs(this.min_value), Math.abs(this.max_value)))) + 3;
			this.input = $("<input>", {	type:		"number",
							name:		this.name,
							id:		( this.R ? this.R.T.tableName : "" )+"-"+this.name,
							value:		this.oldValue,
							placeholder:	this.placeholder,
                            min:            this.min_value,
                            max:            this.max_value })
				.prop("size", this.size);
			break;
		case 'decimal':
            this.size = this.max_digits + 4;
			this.input = $("<input>", {	type:		"number",
							name:		this.name,
							id:		( this.R ? this.R.T.tableName : "" )+"-"+this.name,
							value:		this.oldValue,
							placeholder:	this.placeholder,
                            step:           (10 ** -this.decimal_places),
                            min:            (-(10 ** (this.max_digits-this.decimal_places) - (10 ** -this.decimal_places))),
                            max:            (10 ** (this.max_digits-this.decimal_places) - (10 ** -this.decimal_places)) })
				.prop("size", this.size);
			break;
		case 'email':
			this.input = $("<input>", {	type:		"email",
							name:		this.name, 
							id:		( this.R ? this.R.T.tableName : "" )+"-"+this.name,
							value:		this.oldValue,
							placeholder:	this.placeholder })
				.prop("size", this.size);
			break;
		case 'password':
			this.input = $("<input>", {	type:		"password",
							name:		this.name, 
							id:		( this.R ? this.R.T.tableName : "" )+"-"+this.name,
							value:		this.oldValue,
							placeholder:	this.placeholder })
				.prop("size", this.size);
			break;
		case 'text':
			this.input = $("<textarea/>", { name:		this.name,
							id:		( this.R ? this.R.T.tableName : "" )+"-"+this.name,
							placeholder:	this.placeholder })
				.prop("cols", this.size)
				.prop("rows", 5);
			if (this.oldValue != null) {
				this.input.text(this.oldValue);
			}
			break;
		case 'field':
		case 'choice':
			this.input = $("<select/>", {	name:		this.name,
							id:		( this.R ? this.R.T.tableName : "" )+"-"+this.name });
            if (!this.required) {
				var empty = $("<option/>", {
					value:	"",
					text:	"[not asisgned]"
				});
				if (this.oldValue == null) {
					empty.prop("selected","selected");
				}
				empty.appendTo(this.input);
            }
			for (var i = 0; i < this.options.length; i++) {
				var option = $("<option/>", {
					value:	( this.options[i]['value'] ? this.options[i]['value'] : "NULL" ),
					text:	this.D.stripText(this.options[i]['display_name'], false),
					title:	this.options[i]['display_name']
				});
				if (this.oldValue == this.options[i]['value']) {
					option.prop("selected","selected");
				}
				option.appendTo(this.input);
			}
			break;
		case 'date':
			this.input = $("<input>", {	type:		"date",
							name:		this.name,
							id:		( this.R ? this.R.T.tableName : "" )+"-"+this.name,
							value:		this.oldValue,
							placeholder:	this.placeholder })
				.prop("size", this.size);
			break;
		case 'year':
			this.input = $("<input>", {	type:		"text",
							name:		this.name,
							id:		( this.R ? this.R.T.tableName : "" )+"-"+this.name,
							value:		this.oldValue,
							placeholder:	this.placeholder })
				.prop("size", this.size)
				.datepicker({ dateFormat: "yy" });
			break;
		default:
			// print an error message for unsupported types
			console.log("column "+ ( this.R ? this.R.T.tableName : "" ) +"."+this.name+": type '"+this.type+"' unsupported");
			this.type = undefined;
			// ... and then simply ignore them
			return(false);
	} // switch

	// event handler: change color when content is changed
	this.input.on("input", function(e) {
		if (realThis.value() != realThis.oldValue) {	// value changed
			$(e.currentTarget).addClass("changed-value");
		} else {
			$(e.currentTarget).removeClass("changed-value");
		}
	});

	// add <input> to outer container
	this.input.appendTo(this.outerDiv);
	
	// create a download button if this is the PRIMARY KEY
	if (this.isPriKey) {
		$("<a/>", { text: "Fill template", "class": "foreign-table-button" })
			.button({ text: false, icons: { primary: "ui-icon-copy" }})
			.click(	{ T: this.R.T, value: this.oldValue }, this.R.T.downloadOneFunction )
			.appendTo(this.outerDiv);
	}
	// make a related records and an edit button, if this is a FOREIGN KEY
	if (this.foreign_table != undefined) {
		$("<a/>", { text: "Related records", "class": "foreign-table-button" } )
			.button({ text: false, icons: { primary: "ui-icon-folder-open" }})
			.click( { T: this.R.T, relatedColumn: this.name, value: this.oldValue }, this.R.T.relatedFunction )
			.appendTo(this.outerDiv);
		$("<a/>", { text: (this.R.T.allowEdit ? "Edit" : "View" ),  "class": "foreign-table-button" } )
			.button({ text: false, icons: { primary: (this.R.T.allowEdit ? "ui-icon-pencil" : "ui-icon-search") }})
			.click(	{	T:	this.R.T.D.T(this.foreign_table),
					value:	this.oldValue,
					key:	this.foreign_key } , this.R.T.D.T(this.foreign_table).editFunction )
			.appendTo(this.outerDiv);
	}

    // create an element to show field errors
    this.fieldError = $("<output/>", { "for": ( this.R ? this.R.T.tableName : "" ) + "-" + this.name ,
            "class": "field-error",
            id:	( this.R ? this.R.T.tableName : "" ) + "-" + this.name + "-error" } )
        .appendTo(this.outerDiv);

	this.outerDiv.appendTo(target);

}

/* set_error() : mark field as having an error */
Field.prototype.set_error = function(reason) {
    this.fieldError.text(reason);
    this.input.addClass('ui-state-error');
    this.outerDiv.addClass('ui-state-error');
}

/* clear_error() : mark field as ok/validated */
Field.prototype.clear_error = function() {
    this.fieldError.text('');
    this.outerDiv.removeClass('ui-state-error');
    this.input.removeClass('ui-state-error');
}
