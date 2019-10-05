<?php

/* API version */
define("API_VERSION", "v2");

/* PHP configuration */
ini_set("display_errors","stdout");
ini_set("session.auto_start",false);
ini_set("session.use_cookies",false);
ini_set("session.use_trans_sid",false);

/* date/rime related */
date_default_timezone_set('GMT');
setlocale(LC_TIME, 'C');

/* load config */
require 'config/config.inc.php';

/* main UniDB class */
require 'include/UniDB.php';

/* function to handle exceptions not caught otherwise */
function UniDB_exception_handler($ex) {
	// if a UniDB instance exists, add error to log
	if (isset($_SESSION['UniDB']) && $_SESSION['UniDB'] instanceof UniDB) { // existing session
		$_SESSION['UniDB']->log($ex, true);
	}
	// set HTTP code to internal server error
	http_response_code(500);
	// return the error message as JSON object
	header("Content-type: application/json");
	die(json_encode(array(	"UniDB_fatalError" =>	$ex->getMessage())));
}
set_exception_handler("UniDB_exception_handler");

/*** parse headers and API path ***/
$request_path = isset($_SERVER['PATH_INFO']) ? $_SERVER['PATH_INFO'] : null;
$request_auth = isset($_SERVER['HTTP_AUTHORIZATION']) ? $_SERVER['HTTP_AUTHORIZATION'] : null;

if (empty($request_auth) && isset($_COOKIE["UniDB-session"])) {
	$request_auth = "Bearer ".$_COOKIE["UniDB-session"];
}

/* API URLs are generally constructed as:
 *
 * .../api/{VERSION}/{Section}/{Object}/{Id}
 *
 */
if (!preg_match("#/api/".API_VERSION."(/|/([^/]+)(/|/([^/]+)(/|/([^/]+))?)?)?$#", $request_path, $matches)) {
	header("HTTP/1.1 404 Not found");
	exit(1);
}

$Section = isset($matches[2]) ? $matches[2] : null;
$Object = isset($matches[4]) ? $matches[4] : null;
$Id = isset($matches[6]) ? $matches[6] : null;

if ($Section == "login") {
	if ($_SERVER["REQUEST_METHOD"] == "POST") {
		// now we need a new session
		session_start();

		$login = json_decode(file_get_contents("php://input"), true);

		// initialise new UniDB object
		$_SESSION['UniDB'] = new UniDB($UniDB_config, $login["username"], $login["password"]);
		
		// if login was incorrect we should not get to here (error in DB connect would be fatal)
		
		// return the "message of the day"
		header("Content-type: application/json");
		echo(json_encode(array("UniDB_motd" => $_SESSION['UniDB']->connectInfo(),"session" => session_id())));
	} else if ($_SERVER["REQUEST_METHOD"] == "OPTIONS") {
		http_response_code(204);
		header("Allow: POST,OPTIONS");
	} else {
		http_response_code(405);
		header("Allow: POST,OPTIONS");
	}

} else {	// not a log in request

	if ($request_auth) {	// we have an Authorization header

		if (preg_match("/^[Bb]earer ([A-Za-z0-9\,\-]+)/",$request_auth, $matches)) {
			// we have a session token passed as header
			session_id($matches[1]);
			session_start();
		
			if (isset($_SESSION['UniDB']) && $_SESSION['UniDB'] instanceof UniDB) { // existing session
				if ($Section == "logout") {
					// -> we want to log out
					unset($_SESSION['UniDB']);
					session_destroy();
					die(json_encode(array(	"UniDB_goodbye" => "[bye bye]" )));
				} else {
					// -> otherwise, simply pass command to UniDB instance:
					$_SESSION['UniDB']->api($_SERVER["REQUEST_METHOD"], $Section, $Object, $Id);
				}
			} else { // empty session or wrong session -> tell that user needs to log in
				requestLogin("invalid session token, or session expired");
			}
		} else {
			// header didn't match what we expected
			requestLogin("malformed Authorization header");
		}

	} else {
		// no Authorization header -> tell that user needs to log in
		requestLogin("no session token passed");
	}
}

function requestLogin($message = null) {
	// return 401 Unauthorized and ask for user login
	header("Content-type: application/json");
	header("HTTP/1.1 401 Unauthorized");
	header("WWW-Authenticate: Bearer realm=\"UniDB\"");
	die(
		json_encode(
			array(	"UniDB_requestLogin" =>	1,
				"UniDB_status" => (isset($message) ? $message : "login required" )
			)
		)
	);
}

?>
