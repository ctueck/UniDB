<?php

/* constants for UniDB */

// Table editing permissions
define("P_READONLY",	0);	// readonly = no edit permissions
define("P_NEW",		1);	// create records
define("P_EDIT",	2);	// edit records
define("P_DELETE",	4);	// delete records
define("P_ALL",		7);	// full edit permissions (default)

// Table flags

// Related button functionality
define("R_NONE",	0);	// do not autoload or show buttons in parent record
define("R_NEW",		1);	// show button in parent record if no records exist
define("R_EXIST",	2);	// show button in parent record if records exist
define("R_AUTOLOAD",	4);	// open record together with parent record (if key is UNIQUE)
define("R_DEFAULT",	7);	// default: all related options active

?>
