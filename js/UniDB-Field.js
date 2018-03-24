/*************************************************************************************************************/
/***** Class: Field - a form field, used by Record                                             ***************/
/*************************************************************************************************************/

function Field (DR, name, definition) {
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
	// set objects's properties:
	this.label = definition.label;		// lable/description
	this.type = definition.type;		// type
	this.size = definition.size;		// length (size of input field)
	this.placeholder = definition.placeholder;
	this.options = definition.options;
	this.foreign_table = definition.foreign_table;
	this.foreign_key = definition.foreign_key;
	this.foreign_value = definition.foreign_value;
	this.isRecordName = definition.isName;

	this.set(definition.value);
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
	if (this.type == "checkbox") {
		// for a checkbox, we cannot access the value directly, but have to look at the checked property
		return(this.input.prop("checked") ? 1 : 0);
	} else if (this.type == "raw") {
		// raw elements have no value
		return(null);
	} else {
		// other inputs are trivial (but we return null instead of an empty string
		return(( (this.input.val() == "") || (this.input.val() == "NULL") ) ? null : this.input.val());
	}
}

// label() : display a neat block including <label>
Field.prototype.showLabel = function(target) {
	if (this.label) {
		$("<label/>", {	"for":	( this.R ? this.R.T.tableName : "" ) + "-" + this.name ,
				id:	( this.R ? this.R.T.tableName : "" ) + "-" + this.name + "-label",
				text:	this.label } )
			.appendTo(target);
	}
}

// show() : display a neat block including <label> and/or <input> (return as jQuery object)
Field.prototype.showField = function(target) {
	var realThis = this;			// used in anonymous function

	// if type is raw: just return
	if (this.type == 'raw') {
		this.oldValue.appendTo(target);
		return(true);
	}

	// other types: wrapped in outer <div/>
	var outerDiv = $("<div/>", { id: ( this.R ? this.R.T.tableName : "" ) + "-" + this.name + "-outer" } );

	// the main work is to display according to column type
	switch (this.type) {
		case 'readonly':
			this.input = $("<input/>", {	type:		"text",
							id:		( this.R ? this.R.T.tableName : "" )+"-"+this.name,
							readonly:	"readonly",
							value:		( this.foreign_value ? this.foreign_value : this.oldValue ) })
				.prop("size", this.size);
			break;
		case 'pre':
			if ( this.oldValue == null ) {
				this.input = $("<span/>", { text: "NULL", "class": "sql-null" });
			} else {
				this.input = $("<pre/>", {	id:		( this.R ? this.R.T.tableName : "" )+"-"+this.name,
								text:		( this.foreign_value ? this.foreign_value : this.oldValue ) });
			}
			break;
		case 'checkbox':
			this.input = $("<input>", {	type:		"checkbox",
							name:		this.name,
							id:		( this.R ? this.R.T.tableName : "" )+"-"+this.name,
							value: 		1 });
			if (this.oldValue == 1) {
				this.input.prop("checked","checked");
			}
			break;
		case 'char':
			this.input = $("<input>", {	type:		"text",
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
		case 'select':
			this.input = $("<select/>", {	name:		this.name,
							id:		( this.R ? this.R.T.tableName : "" )+"-"+this.name });
			for (var i = 0; i < this.options.length; i++) {
				var option = $("<option/>", {
					value:	( this.options[i][0] ? this.options[i][0] : "NULL" ),
					text:	this.options[i][1]
				});
				if (this.oldValue == this.options[i][0]) {
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
				.prop("size", this.size)
				.datepicker({ dateFormat: "yy-mm-dd" });
			break;
		case 'year':	
			this.input = $("<input>", {	type:		"date",
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
	this.input.change(function(e) {
		if (realThis.value() != realThis.oldValue) {	// value changed
			$(e.currentTarget).addClass("changed-value");
		} else {
			$(e.currentTarget).removeClass("changed-value");
		}
	});

	this.input.appendTo(outerDiv);
	
	// make a related records and an edit button, if this is a FOREIGN KEY
	if (this.foreign_table != undefined) {
		$("<a/>", { href: "#", text: "Related records", "class": "foreign-table-button" } )
			.button({ text: false, icons: { primary: "ui-icon-folder-open" }})
			.click( { T: this.R.T, relatedColumn: this.name, value: this.oldValue }, this.R.T.relatedFunction )
			.appendTo(outerDiv);
		$("<a/>", { href: "#", text: (this.R.T.allowEdit ? "Edit" : "View" ),  "class": "foreign-table-button" } )
			.button({ text: false, icons: { primary: (this.R.T.allowEdit ? "ui-icon-pencil" : "ui-icon-search") }})
			.click(	{	T:	this.R.T.D.T(this.foreign_table),
					value:	this.oldValue,
					key:	this.foreign_key } , this.R.T.D.T(this.foreign_table).editFunction )
			.appendTo(outerDiv);
	}

	outerDiv.appendTo(target);

}

